import { ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  ApiError,
  createProduct,
  getScanner,
  lookupBarcode,
  normalizeBarcode,
  type Product,
  type ShopProduct,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAddProductsBulk, useShopProducts } from "@/features/queries";

type Stage =
  | { name: "scan" }
  | { name: "looking"; code: string }
  | { name: "add"; product: Product } // known to the catalogue, not yet in this shop
  | { name: "create"; code: string } // not in the catalogue at all
  | { name: "similar"; code: string; draft: NewProduct; similar: Product[] };

type NewProduct = {
  name: string;
  brand: string;
  size: string;
  unit: "piece" | "gram";
  mrp: string;
};

/**
 * Scan (or type) a barcode. Calls `onProduct` with the shop's own product row once it is known,
 * adding it to the shop first when needed, so billing and stock screens only deal with ready items.
 */
export function ScanDialog({
  open,
  onOpenChange,
  onProduct,
  title = "Scan a barcode",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProduct: (row: ShopProduct) => void;
  title?: string;
}) {
  const [stage, setStage] = useState<Stage>({ name: "scan" });
  const products = useShopProducts();
  const video = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState(false);
  const [manual, setManual] = useState("");

  const handleCode = async (raw: string) => {
    const code = normalizeBarcode(raw);
    if (!code) {
      toast.error("That doesn't look like a barcode (6 to 14 digits).");
      return;
    }
    setStage({ name: "looking", code });
    try {
      const product = await lookupBarcode(code);
      if (!product) return setStage({ name: "create", code });
      const mine = products.data?.find((p) => p.product?.id === product.id);
      if (mine) return finish(mine);
      setStage({ name: "add", product });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not look that up.");
      setStage({ name: "scan" });
    }
  };

  const finish = (row: ShopProduct) => {
    onProduct(row);
    onOpenChange(false);
  };

  // Camera runs only while the scan stage is showing.
  useEffect(() => {
    if (!open || stage.name !== "scan" || !video.current) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    getScanner()
      .start(video.current, (code) => void handleCode(code))
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch(() => setCameraError(true));
    return () => {
      cancelled = true;
      stop?.();
    };
    // handleCode is recreated each render; the scanner only needs the latest through the closure
    // of the render in which the stage became "scan".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stage.name]);

  useEffect(() => {
    if (open) {
      setStage({ name: "scan" });
      setManual("");
      setCameraError(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mobile-dialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {stage.name === "scan" && "Point the camera at the barcode, or type the number."}
          {stage.name === "looking" && "Looking it up…"}
          {stage.name === "add" && "Found it. Add it to your shop."}
          {stage.name === "create" && "New to Kannect. Add the details once for everyone."}
          {stage.name === "similar" && "Is it one of these?"}
        </DialogDescription>

        {stage.name === "scan" && (
          <>
            {cameraError ? (
              <p className="text-sm text-muted-foreground">
                The camera isn't available here. Type the number printed under the barcode.
              </p>
            ) : (
              <video
                ref={video}
                className="w-full rounded-2xl bg-muted aspect-[4/3] object-cover"
                muted
                playsInline
              />
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleCode(manual);
              }}
            >
              <input
                className="page-search min-w-0"
                aria-label="Barcode number"
                inputMode="numeric"
                placeholder="Barcode number"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
              <Button size="icon" aria-label="Look up" disabled={!manual.trim()}>
                <ScanLine />
              </Button>
            </form>
          </>
        )}

        {stage.name === "add" && (
          <AddToShop product={stage.product} onAdded={finish} onCancel={() => setStage({ name: "scan" })} />
        )}

        {stage.name === "create" && (
          <CreateProductForm
            code={stage.code}
            onCancel={() => setStage({ name: "scan" })}
            onCreated={(product) => setStage({ name: "add", product })}
            onSimilar={(draft, similar) => setStage({ name: "similar", code: stage.code, draft, similar })}
          />
        )}

        {stage.name === "similar" && (
          <div className="space-y-3">
            {stage.similar.map((p) => (
              <Button
                key={p.id}
                variant="outline"
                className="w-full justify-start h-auto py-3 text-left"
                onClick={() => setStage({ name: "add", product: p })}
              >
                <span>
                  {[p.brand, p.name, p.size].filter(Boolean).join(" ")}
                  <span className="block text-xs text-muted-foreground">Use this one</span>
                </span>
              </Button>
            ))}
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                try {
                  const r = await createProduct(toBody(stage.code, stage.draft), true);
                  if (r.created) setStage({ name: "add", product: r.product });
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "Could not add it.");
                }
              }}
            >
              No, it's a different product
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function toBody(code: string, d: NewProduct) {
  return {
    barcode: code,
    name: d.name.trim(),
    brand: d.brand.trim() || null,
    size: d.size.trim() || null,
    unit: d.unit,
    mrp: d.mrp ? Number(d.mrp) : null,
  };
}

function CreateProductForm({
  code,
  onCancel,
  onCreated,
  onSimilar,
}: {
  code: string;
  onCancel: () => void;
  onCreated: (p: Product) => void;
  onSimilar: (draft: NewProduct, similar: Product[]) => void;
}) {
  const [draft, setDraft] = useState<NewProduct>({
    name: "",
    brand: "",
    size: "",
    unit: "piece",
    mrp: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<NewProduct>) => setDraft({ ...draft, ...patch });

  const submit = async () => {
    setBusy(true);
    try {
      const r = await createProduct(toBody(code, draft));
      if (r.created) onCreated(r.product);
      else onSimilar(draft, r.similar);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-xs text-muted-foreground">Barcode {code}</p>
      <input className="page-search" aria-label="Product name" placeholder="Product name" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
      <input className="page-search" aria-label="Brand" placeholder="Brand (optional)" value={draft.brand} onChange={(e) => set({ brand: e.target.value })} />
      <div className="flex gap-2">
        <input className="page-search min-w-0" aria-label="Size" placeholder="Size, e.g. 100 g" value={draft.size} onChange={(e) => set({ size: e.target.value })} />
        <input className="page-search min-w-0" aria-label="MRP" inputMode="decimal" placeholder="MRP ₹" value={draft.mrp} onChange={(e) => set({ mrp: e.target.value })} />
      </div>
      <select className="page-search" aria-label="Sold by" value={draft.unit} onChange={(e) => set({ unit: e.target.value as NewProduct["unit"] })}>
        <option value="piece">Sold by piece</option>
        <option value="gram">Sold by weight (per kg)</option>
      </select>
      <Button className="w-full" disabled={busy || !draft.name.trim()}>
        {busy ? "Adding…" : "Add product"}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
        Scan again
      </Button>
    </form>
  );
}

function AddToShop({
  product,
  onAdded,
  onCancel,
}: {
  product: Product;
  onAdded: (row: ShopProduct) => void;
  onCancel: () => void;
}) {
  const add = useAddProductsBulk();
  const [price, setPrice] = useState(product.mrp ? String(product.mrp) : "");
  const [count, setCount] = useState("");
  const perKg = product.unit === "gram";

  const submit = async () => {
    try {
      const qty = count === "" ? undefined : Math.round(Number(count) * (perKg ? 1000 : 1));
      const res = await add.mutateAsync({
        items: [
          {
            product_id: product.id as string,
            price: Number(price),
            ...(qty === undefined
              ? { stock_level: "unknown" as const }
              : { opening_stock: qty, count_source: "owner_exact" as const }),
          },
        ],
      });
      const row = res.items?.[0];
      if (row) onAdded(row);
      else toast.error("That product is already in your shop.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not add it.");
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="font-semibold text-sm">
        {[product.brand, product.name, product.size].filter(Boolean).join(" ")}
      </p>
      <input
        className="page-search"
        aria-label={perKg ? "Price per kg" : "Your price"}
        inputMode="decimal"
        placeholder={perKg ? "Your price per kg ₹" : "Your price ₹"}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <input
        className="page-search"
        aria-label={perKg ? "How many kg do you have" : "How many do you have"}
        inputMode="decimal"
        placeholder={perKg ? "Kg in stock (optional)" : "Count in stock (optional)"}
        value={count}
        onChange={(e) => setCount(e.target.value)}
      />
      <Button className="w-full" disabled={add.isPending || !(Number(price) > 0)}>
        {add.isPending ? "Adding…" : "Add to my shop"}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
        Scan again
      </Button>
    </form>
  );
}
