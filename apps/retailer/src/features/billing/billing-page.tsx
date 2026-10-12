import { ChevronRight, CircleCheck, Mic, Minus, Package, Plus, ScanLine } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, type ShopProduct } from "@/api";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCreateBill, useShopProducts } from "@/features/queries";
import { ScanDialog } from "@/features/scan/scan-dialog";
import { clampToStock, formatQty, lineTotal, newId, priceLabel, rupees, STATUS_LABEL, statusClass, stepFor } from "@/lib/format";
import { t, tf, useLocale } from "@/lib/i18n";

import { VoiceDialog, type VoiceLine } from "./voice-dialog";

type PaymentMode = "cash" | "upi" | "card" | "other";

export function BillingPage() {
  const locale = useLocale();
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

  // A bill can never take more than the shop has: the quantity stops at the stock count.
  const limitMessage = (id: string, max: number) => {
    const unit = byId.get(id)?.product?.unit;
    return max === 0
      ? t("Out of stock. Count it in Stock first if you have some.", locale)
      : tf("Only {qty} in stock.", { qty: formatQty(max, unit, locale) }, locale);
  };

  const addQty = (id: string, delta: number) => {
    const { next, max, limited } = clampToStock(cart[id] ?? 0, delta, byId.get(id)?.stock_qty);
    if (limited) toast.info(limitMessage(id, max));
    setCart((c) => {
      const { [id]: _drop, ...rest } = c;
      return next > 0 ? { ...rest, [id]: next } : rest;
    });
  };

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
      toast.error(e instanceof ApiError ? e.message : t("Could not save the bill. Try again.", locale));
    }
  };

  const onScanned = (row: ShopProduct) => {
    if (row.product?.id) addQty(row.product.id, stepFor(row.product.unit));
    toast.success(tf("Added {name}", { name: row.product?.name ?? "" }, locale));
  };

  const onVoice = (lines: VoiceLine[]) => {
    const next = { ...cart };
    let capped = 0;
    lines.forEach((l) => {
      const { next: qty, limited } = clampToStock(next[l.productId] ?? 0, l.quantity, byId.get(l.productId)?.stock_qty);
      if (limited) capped++;
      if (qty > 0) next[l.productId] = qty;
    });
    setCart(next);
    toast.success(tf(lines.length === 1 ? "Added {n} item" : "Added {n} items", { n: lines.length }, locale));
    if (capped) {
      toast.info(
        tf(capped === 1 ? "{n} item was limited to what is in stock." : "{n} items were limited to what is in stock.", { n: capped }, locale),
      );
    }
  };

  return (
    <Shell active="Billing">
      <p className="eyebrow">{t("Billing", locale)}</p>
      <h1>{t("Create a bill", locale)}</h1>

      <div className="flex gap-2 my-3">
        <input
          className="page-search min-w-0"
          aria-label={t("Search billing products", locale)}
          placeholder={t("Search products…", locale)}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button size="icon" aria-label={t("Scan barcode", locale)} onClick={() => setScan(true)}>
          <ScanLine />
        </Button>
        <Button size="icon" variant="secondary" aria-label={t("Speak the bill", locale)} onClick={() => setVoice(true)}>
          <Mic />
        </Button>
      </div>

      {products.isLoading && <p className="py-6 text-center text-muted-foreground">{t("Loading your products…", locale)}</p>}
      {products.isError && <p className="py-6 text-center text-destructive">{t("Could not load products. Pull to retry.", locale)}</p>}
      {products.data && products.data.length === 0 && (
        <p className="py-6 text-center text-muted-foreground">
          {t("Your shop has no products yet. Scan a barcode or start with a shelf photo from More.", locale)}
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
                  {priceLabel(row.price, row.product?.unit, locale)} · {tf("{qty} in stock", { qty: formatQty(row.stock_qty ?? 0, row.product?.unit, locale) }, locale)} ·{" "}
                  <span className={`status-pill ${statusClass(row.stock_status)}`}>
                    {t(STATUS_LABEL[row.stock_status ?? "in_stock"] ?? "", locale)}
                  </span>
                </div>
              </div>
              <div className="quantity-controls">
                {qty > 0 && (
                  <>
                    <Button variant="outline" size="icon" aria-label={tf("Remove one {name}", { name: row.product?.name ?? "" }, locale)} onClick={() => addQty(id, -step)}>
                      <Minus />
                    </Button>
                    <span>{formatQty(qty, row.product?.unit, locale)}</span>
                  </>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={tf(qty >= (row.stock_qty ?? 0) ? "No more {name} in stock" : "Add {name}", { name: row.product?.name ?? "" }, locale)}
                  disabled={qty >= Math.max(0, row.stock_qty ?? 0)}
                  onClick={() => addQty(id, step)}
                >
                  <Plus />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {products.data && shown.length === 0 && products.data.length > 0 && (
        <p className="py-6 text-center text-muted-foreground">{t("No matching products. Try a different name or scan it.", locale)}</p>
      )}

      <div className="flex justify-between mt-4 mb-2">
        <span>{tf(items.length === 1 ? "{n} item" : "{n} items", { n: items.length }, locale)}</span>
        <strong>{rupees(total)}</strong>
      </div>
      <Button className="w-full" disabled={items.length === 0} onClick={() => { setDone(null); setReview(true); }}>
        {t("Review bill", locale)} <ChevronRight />
      </Button>

      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>{done ? t("Bill saved", locale) : t("Review bill", locale)}</DialogTitle>
          <DialogDescription>
            {done ? t("Stock has been updated.", locale) : t("Check the quantities before confirming.", locale)}
          </DialogDescription>
          {done ? (
            <>
              <CircleCheck className="text-primary mx-auto" size={48} />
              <p className="text-center text-lg font-semibold">{rupees(done.total)}</p>
              {done.url && (
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(done.url!).then(() => toast.success(t("Link copied", locale)))}
                >
                  {t("Copy e-bill link", locale)}
                </Button>
              )}
              <Button onClick={() => setReview(false)}>{t("Start another bill", locale)}</Button>
            </>
          ) : (
            <>
              {items.map(({ id, qty, row }) => (
                <div key={id} className="flex justify-between text-sm">
                  <span>
                    {row.product?.name} × {formatQty(qty, row.product?.unit, locale)}
                    <span className="block text-muted-foreground">{priceLabel(row.price, row.product?.unit, locale)}</span>
                  </span>
                  <strong>{rupees(lineTotal(row.price ?? 0, qty, row.product?.unit))}</strong>
                </div>
              ))}
              <div className="flex justify-between border-t pt-3">
                <strong>{t("Total", locale)}</strong>
                <strong>{rupees(total)}</strong>
              </div>
              <select className="page-search kn-select" aria-label={t("Payment", locale)} value={payment} onChange={(e) => setPayment(e.target.value as PaymentMode)}>
                <option value="cash">{t("Cash", locale)}</option>
                <option value="upi">{t("UPI", locale)}</option>
                <option value="card">{t("Card", locale)}</option>
                <option value="other">{t("Other", locale)}</option>
              </select>
              <Button disabled={createBill.isPending} onClick={() => void confirm()}>
                {createBill.isPending ? t("Saving…", locale) : t("Confirm bill", locale)}
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
