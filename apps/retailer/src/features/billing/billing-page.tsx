import { ChevronRight, CircleCheck, Mic, Minus, Package, Plus, ScanLine } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, type ShopProduct } from "@/api";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCreateBill, useShopProducts } from "@/features/queries";
import { ScanDialog } from "@/features/scan/scan-dialog";
import { formatQty, lineTotal, newId, priceLabel, rupees, STATUS_LABEL, statusClass, stepFor } from "@/lib/format";

import { VoiceDialog, type VoiceLine } from "./voice-dialog";

type PaymentMode = "cash" | "upi" | "card" | "other";

export function BillingPage() {
  const products = useShopProducts();
  const createBill = useCreateBill();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [review, setReview] = useState(false);
  const [scan, setScan] = useState(false);
  const [voice, setVoice] = useState(false);
  const [payment, setPayment] = useState<PaymentMode>("cash");
  const [done, setDone] = useState<{ total: number; url?: string | undefined } | null>(null);
  // One id per bill attempt: a retry after a flaky connection can never charge twice.
  const billId = useRef(newId());

  const byId = useMemo(() => {
    const map = new Map<string, ShopProduct>();
    (products.data ?? []).forEach((p) => p.product?.id && map.set(p.product.id, p));
    return map;
  }, [products.data]);

  const shown = (products.data ?? [])
    .filter((p) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const prod = p.product;
      return `${prod?.name ?? ""} ${prod?.brand ?? ""} ${prod?.name_ml ?? ""}`.toLowerCase().includes(q);
    })
    .slice(0, 60);

  const addQty = (id: string, delta: number) =>
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      const { [id]: _drop, ...rest } = c;
      return next > 0 ? { ...rest, [id]: next } : rest;
    });

  const items = Object.entries(cart)
    .map(([id, qty]) => ({ id, qty, row: byId.get(id) }))
    .filter((x): x is { id: string; qty: number; row: ShopProduct } => Boolean(x.row));
  const total = items.reduce(
    (sum, { row, qty }) => sum + lineTotal(row.price ?? 0, qty, row.product?.unit),
    0,
  );

  const confirm = async () => {
    try {
      const bill = await createBill.mutateAsync({
        client_id: billId.current,
        payment_mode: payment,
        items: items.map(({ id, qty }) => ({ product_id: id, quantity: qty })),
      });
      setDone({ total: bill.total ?? total, url: bill.share_url });
      billId.current = newId();
      setCart({});
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save the bill. Try again.");
    }
  };

  const onScanned = (row: ShopProduct) => {
    if (row.product?.id) addQty(row.product.id, stepFor(row.product.unit));
    toast.success(`Added ${row.product?.name}`);
  };

  const onVoice = (lines: VoiceLine[]) => {
    setCart((c) => {
      const next = { ...c };
      lines.forEach((l) => (next[l.productId] = (next[l.productId] ?? 0) + l.quantity));
      return next;
    });
    toast.success(`Added ${lines.length} item${lines.length === 1 ? "" : "s"}`);
  };

  return (
    <Shell active="Billing">
      <p className="eyebrow">Billing</p>
      <h1>Create a bill</h1>

      <div className="flex gap-2 my-3">
        <input
          className="page-search min-w-0"
          aria-label="Search billing products"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button size="icon" aria-label="Scan barcode" onClick={() => setScan(true)}>
          <ScanLine />
        </Button>
        <Button size="icon" variant="secondary" aria-label="Speak the bill" onClick={() => setVoice(true)}>
          <Mic />
        </Button>
      </div>

      {products.isLoading && <p className="py-6 text-center text-muted-foreground">Loading your products…</p>}
      {products.isError && <p className="py-6 text-center text-destructive">Could not load products. Pull to retry.</p>}
      {products.data && products.data.length === 0 && (
        <p className="py-6 text-center text-muted-foreground">
          Your shop has no products yet. Scan a barcode or start with a shelf photo from More.
        </p>
      )}

      <div className="list-surface">
        {shown.map((row) => {
          const id = row.product?.id as string;
          const qty = cart[id] ?? 0;
          const step = stepFor(row.product?.unit);
          return (
            <div key={id} className="product-row">
              <div className="product-art text-primary" aria-hidden="true">
                <Package size={25} />
              </div>
              <div className="min-w-0">
                <div className="product-name">{row.product?.name}</div>
                <div className="product-sub">
                  {priceLabel(row.price, row.product?.unit)} ·{" "}
                  <span className={`status-pill ${statusClass(row.stock_status)}`}>
                    {STATUS_LABEL[row.stock_status ?? "in_stock"]}
                  </span>
                </div>
              </div>
              <div className="quantity-controls">
                {qty > 0 && (
                  <>
                    <Button variant="outline" size="icon" aria-label={`Remove one ${row.product?.name}`} onClick={() => addQty(id, -step)}>
                      <Minus />
                    </Button>
                    <span>{formatQty(qty, row.product?.unit)}</span>
                  </>
                )}
                <Button variant="outline" size="icon" aria-label={`Add ${row.product?.name}`} onClick={() => addQty(id, step)}>
                  <Plus />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {products.data && shown.length === 0 && products.data.length > 0 && (
        <p className="py-6 text-center text-muted-foreground">No matching products. Try a different name or scan it.</p>
      )}

      <div className="flex justify-between mt-4 mb-2">
        <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
        <strong>{rupees(total)}</strong>
      </div>
      <Button className="w-full" disabled={items.length === 0} onClick={() => { setDone(null); setReview(true); }}>
        Review bill <ChevronRight />
      </Button>

      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>{done ? "Bill saved" : "Review bill"}</DialogTitle>
          <DialogDescription>
            {done ? "Stock has been updated." : "Check the quantities before confirming."}
          </DialogDescription>
          {done ? (
            <>
              <CircleCheck className="text-primary mx-auto" size={48} />
              <p className="text-center text-lg font-semibold">{rupees(done.total)}</p>
              {done.url && (
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(done.url!).then(() => toast.success("Link copied"))}
                >
                  Copy e-bill link
                </Button>
              )}
              <Button onClick={() => setReview(false)}>Start another bill</Button>
            </>
          ) : (
            <>
              {items.map(({ id, qty, row }) => (
                <div key={id} className="flex justify-between text-sm">
                  <span>
                    {row.product?.name} × {formatQty(qty, row.product?.unit)}
                    <span className="block text-muted-foreground">{priceLabel(row.price, row.product?.unit)}</span>
                  </span>
                  <strong>{rupees(lineTotal(row.price ?? 0, qty, row.product?.unit))}</strong>
                </div>
              ))}
              <div className="flex justify-between border-t pt-3">
                <strong>Total</strong>
                <strong>{rupees(total)}</strong>
              </div>
              <select className="page-search" aria-label="Payment" value={payment} onChange={(e) => setPayment(e.target.value as PaymentMode)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
              <Button disabled={createBill.isPending} onClick={() => void confirm()}>
                {createBill.isPending ? "Saving…" : "Confirm bill"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ScanDialog open={scan} onOpenChange={setScan} onProduct={onScanned} />
      <VoiceDialog open={voice} onOpenChange={setVoice} onAdd={onVoice} />
    </Shell>
  );
}
