import { Camera } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, shelfPhoto } from "@/api";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { useAddProductsBulk, useRecount } from "@/features/queries";
import { formatQty, newId } from "@/lib/format";
import { useNavigate } from "@tanstack/react-router";

type Result = Awaited<ReturnType<typeof shelfPhoto>>;
type Detection = NonNullable<Result["detections"]>[number];
type Level = "plenty" | "some" | "few" | "none";

type Row = {
  key: string;
  label: string;
  productId: string;
  unit: string;
  loose: boolean;
  include: boolean;
  level: Level;
  price: string;
  priceHint: string;
  inShop: boolean;
  currentQty: number | null;
  currentStatus: string | null;
};

const LEVELS: [Level, string][] = [
  ["plenty", "Plenty"],
  ["some", "Some"],
  ["few", "Few"],
  ["none", "None"],
];

function toRow(d: Detection, i: number): Row | null {
  if (!d.match?.id) return null; // unmatched items need a barcode scan (Billing, or Stock)
  const level = (d.suggested_level as Level | undefined) ?? "some";
  return {
    key: `${d.match.id}-${i}`,
    label: d.match.name ?? d.label ?? "",
    productId: d.match.id,
    unit: d.match.unit ?? "piece",
    loose: Boolean(d.loose),
    include: !d.uncertain,
    level,
    price: d.suggested_price != null ? String(d.suggested_price) : "",
    priceHint:
      d.price_source === "mrp" ? "printed price" : d.price_source === "nearby_median" ? "typical nearby" : "",
    inShop: Boolean(d.in_shop),
    currentQty: d.current_quantity ?? null,
    currentStatus: d.current_status ?? null,
  };
}

export function OnboardPage() {
  const navigate = useNavigate();
  const addBulk = useAddProductsBulk();
  const recount = useRecount();
  const [files, setFiles] = useState<File[]>([]);
  const [thorough, setThorough] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needScan, setNeedScan] = useState<string[]>([]);

  const read = async () => {
    setBusy(true);
    try {
      const res = await shelfPhoto(files, thorough);
      const detections = res.detections ?? [];
      const seen = new Set<string>();
      const next: Row[] = [];
      detections.forEach((d, i) => {
        const row = toRow(d, i);
        if (row && !seen.has(row.productId)) {
          seen.add(row.productId);
          next.push(row);
        }
      });
      setRows(next);
      setNeedScan(
        detections.filter((d) => !d.match && d.label && d.needs_scan).map((d) => d.label as string),
      );
      if (res.image_quality && res.image_quality !== "good") {
        toast.warning(`The photo looks ${String(res.image_quality).replace("_", " ")}. Retake it for better results.`);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not read the photo.");
    } finally {
      setBusy(false);
    }
  };

  const patch = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...p } : r)) ?? null);

  const save = async () => {
    if (!rows) return;
    const chosen = rows.filter((r) => r.include);
    const fresh = chosen.filter((r) => !r.inShop);
    const existing = chosen.filter((r) => r.inShop);
    if (fresh.some((r) => !(Number(r.price) > 0))) {
      toast.error("Add a price for each new product.");
      return;
    }
    try {
      if (fresh.length) {
        await addBulk.mutateAsync({
          items: fresh.map((r) => ({
            product_id: r.productId,
            price: Number(r.price),
            stock_level: r.level,
            count_source: "photo_estimate" as const,
          })),
        });
      }
      if (existing.length) {
        await recount.mutateAsync({
          items: existing.map((r) => ({
            client_id: newId(),
            product_id: r.productId,
            stock_level: r.level,
            count_source: "photo_estimate" as const,
          })),
        });
      }
      toast.success(`Saved ${chosen.length} product${chosen.length === 1 ? "" : "s"}`);
      await navigate({ to: "/stock" });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save.");
    }
  };

  return (
    <Shell active="More">
      <p className="eyebrow">Set up from a photo</p>
      <h1>Shelf photo</h1>

      {!rows && (
        <div className="space-y-4 mt-3">
          <p className="text-sm text-muted-foreground">
            Take clear photos of your shelves, up to 6. We read the labels and suggest your products.
            You confirm before anything is saved.
          </p>
          <label className="list-surface flex items-center gap-3 p-4 cursor-pointer">
            <Camera />
            <span className="text-sm">
              {files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} selected` : "Take or choose photos"}
            </span>
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={thorough} onChange={(e) => setThorough(e.target.checked)} />
            Look closely for small labels (slower: about 30 seconds a photo)
          </label>
          <Button className="w-full" disabled={busy || files.length === 0} onClick={() => void read()}>
            {busy ? "Reading your shelves… please wait" : "Read photos"}
          </Button>
        </div>
      )}

      {rows && (
        <div className="space-y-3 mt-3">
          <p className="text-sm text-muted-foreground">
            {rows.length} product{rows.length === 1 ? "" : "s"} found. Untick anything wrong, fix the amounts and
            prices, then save.
          </p>
          <div className="list-surface">
            {rows.map((r) => (
              <div key={r.key} className="p-4 border-b last:border-0 space-y-2">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1" checked={r.include} onChange={(e) => patch(r.key, { include: e.target.checked })} />
                  <span className="min-w-0">
                    <span className="product-name block">{r.label}</span>
                    {r.inShop && (
                      <span className="product-sub block">
                        In your shop: {formatQty(r.currentQty, r.unit)} ({r.currentStatus}). Saving will recount it from this photo.
                      </span>
                    )}
                  </span>
                </label>
                {r.include && (
                  <div className="flex flex-wrap gap-2 items-center">
                    {LEVELS.map(([value, name]) => (
                      <Button key={value} size="sm" variant={r.level === value ? "secondary" : "ghost"} onClick={() => patch(r.key, { level: value })}>
                        {name}
                      </Button>
                    ))}
                    {!r.inShop && (
                      <input
                        className="page-search max-w-40"
                        aria-label={`Price for ${r.label}`}
                        inputMode="decimal"
                        placeholder={r.unit === "gram" ? "₹ per kg" : "₹ price"}
                        value={r.price}
                        onChange={(e) => patch(r.key, { price: e.target.value })}
                      />
                    )}
                    {!r.inShop && r.priceHint && <span className="text-xs text-muted-foreground">{r.priceHint}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
          {needScan.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Not in our catalogue yet, add these by scanning their barcode in Billing or Stock:{" "}
              {[...new Set(needScan)].slice(0, 12).join(", ")}
              {needScan.length > 12 ? "…" : ""}
            </p>
          )}
          <Button className="w-full" disabled={addBulk.isPending || recount.isPending} onClick={() => void save()}>
            {addBulk.isPending || recount.isPending ? "Saving…" : "Save to my shop"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setRows(null)}>
            Start over
          </Button>
        </div>
      )}
    </Shell>
  );
}
