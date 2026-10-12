import { ChevronRight, Leaf, Store, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, cancelOrder, placeOrder } from "@/api";
import { Heading, Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { keys, useOrders, useReceiveOrder, useReorderSuggestions } from "@/features/queries";
import { OrderRouteMap } from "@/features/orders/order-route-map";
import { SupplierBrowser, type SupplierRow } from "@/features/orders/supplier-browser";
import { newId, orderStatusLabel, rupees } from "@/lib/format";
import { t, tf, useLocale, type Locale } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";

type Suggestion = NonNullable<ReturnType<typeof useReorderSuggestions>["data"]>[number];
type Order = NonNullable<ReturnType<typeof useOrders>["data"]>[number];
type TrackingEvent = NonNullable<Order["tracking"]>[number];

function chronologicalTracking(events: TrackingEvent[] | undefined) {
  return [...(events ?? [])]
    .filter((event) => event.at && Number.isFinite(Date.parse(event.at)))
    .sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));
}

function latestEta(events: TrackingEvent[]) {
  return [...events]
    .filter((event) => event.eta && Number.isFinite(Date.parse(event.eta)))
    .sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!))[0]?.eta;
}

function formatTimestamp(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ml" ? "ml-IN" : undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function OrdersPage() {
  const locale = useLocale();
  const orders = useOrders();
  const suggestions = useReorderSuggestions();
  const receive = useReceiveOrder();
  const qc = useQueryClient();
  const [list, setList] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [detail, setDetail] = useState<Order | null>(null);
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [optionIndex, setOptionIndex] = useState(0);
  const [packs, setPacks] = useState("1");
  const [orderId, setOrderId] = useState(newId());
  const [placing, setPlacing] = useState(false);

  const choose = (s: Suggestion) => {
    setPicked(s);
    setOptionIndex(0);
    setPacks(String(s.suggested_packs ?? 1));
    setOrderId(newId());
  };

  // an item picked from a supplier's full catalogue is ordered the same way as a suggestion
  const chooseFromCatalogue = (row: SupplierRow) => {
    choose({
      shop_product: { product: row.product },
      reason: t("From the supplier's catalogue", locale),
      suggested_packs: row.min_order_packs ?? 1,
      options: [row],
    } as Suggestion);
    setBrowse(false);
  };

  const option = picked?.options?.[optionIndex];
  const nPacks = Math.max(1, Math.floor(Number(packs) || 1));

  const place = async () => {
    if (!option?.supplier?.id || !option.product?.id) return;
    setPlacing(true);
    try {
      await placeOrder({
        client_id: orderId,
        supplier_id: option.supplier.id,
        items: [{ product_id: option.product.id, packs: nPacks }],
      });
      toast.success(t("Order placed", locale));
      setPicked(null);
      setList(false);
      await qc.invalidateQueries({ queryKey: keys.orders });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("Could not place the order.", locale));
    } finally {
      setPlacing(false);
    }
  };

  const doReceive = async (o: Order) => {
    try {
      await receive.mutateAsync(o.id as string);
      toast.success(t("Received into your stock", locale));
      setDetail(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("Could not record the delivery.", locale));
    }
  };

  const doCancel = async (o: Order) => {
    try {
      await cancelOrder(o.id as string);
      await qc.invalidateQueries({ queryKey: keys.orders });
      setDetail(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("Could not cancel the order.", locale));
    }
  };

  const count = suggestions.data?.length ?? 0;
  const tracking = chronologicalTracking(detail?.tracking);
  const eta = latestEta(tracking);

  return (
    <Shell active="Orders">
      <p className="eyebrow">{t("Restock your shop", locale)}</p>
      <h1>{t("Orders", locale)}</h1>
      <Button variant="secondary" className="w-full mt-3 justify-between" onClick={() => setList(true)}>
        <span className="flex items-center gap-2">
          <Leaf />
          {tf(count === 1 ? "{n} reorder suggestion" : "{n} reorder suggestions", { n: count }, locale)}
        </span>
        <ChevronRight />
      </Button>

      <Button variant="outline" className="w-full mt-2 justify-between" onClick={() => setBrowse(true)}>
        <span className="flex items-center gap-2">
          <Store />
          {t("Browse supplier catalogue", locale)}
        </span>
        <ChevronRight />
      </Button>

      <Heading title={t("Your orders", locale)} />
      {orders.isLoading && <p className="text-muted-foreground text-sm">{t("Loading…", locale)}</p>}
      {orders.data && orders.data.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("No orders yet. Start from a suggestion above.", locale)}</p>
      )}
      <div className="list-surface">
        {(orders.data ?? []).map((o) => (
          <button key={o.id} type="button" className="order-preview w-full text-left" onClick={() => setDetail(o)}>
            <Truck className="text-primary" />
            <div className="min-w-0">
              <div className="product-name">{o.supplier?.name}</div>
              <div className="product-sub">
                {tf((o.items?.length ?? 0) === 1 ? "{n} item" : "{n} items", { n: o.items?.length ?? 0 }, locale)} · {rupees(o.total)}
              </div>
            </div>
            <span className="status-pill">{orderStatusLabel(o.status, locale)}</span>
          </button>
        ))}
      </div>

      <SupplierBrowser open={browse} onOpenChange={setBrowse} onPick={chooseFromCatalogue} />

      <Dialog open={list} onOpenChange={setList}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>{t("Reorder suggestions", locale)}</DialogTitle>
          <DialogDescription>{t("Low or out of stock, with suppliers near you. Nothing is ordered until you confirm.", locale)}</DialogDescription>
          {suggestions.data?.length === 0 && <p className="text-sm">{t("Nothing needs restocking.", locale)}</p>}
          {(suggestions.data ?? []).map((s) => (
            <button key={s.shop_product?.product?.id} type="button" className="border-b py-3 text-left" onClick={() => choose(s)}>
              <strong className="text-sm">{s.shop_product?.product?.name}</strong>
              <p className="text-xs text-muted-foreground">{s.reason}</p>
              <p className="text-xs text-primary">
                {tf((s.options?.length ?? 0) === 1 ? "{n} supplier" : "{n} suppliers", { n: s.options?.length ?? 0 }, locale)} · {tf(s.suggested_packs === 1 ? "suggest {n} pack" : "suggest {n} packs", { n: s.suggested_packs ?? 1 }, locale)}
              </p>
            </button>
          ))}
        </DialogContent>
      </Dialog>

      <Dialog open={picked !== null} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>{picked?.shop_product?.product?.name}</DialogTitle>
          <DialogDescription>{picked?.reason}</DialogDescription>
          {(picked?.options ?? []).map((o, i) => (
            <Button key={o.supplier?.id} variant={i === optionIndex ? "secondary" : "outline"} className="justify-between h-auto py-3" onClick={() => setOptionIndex(i)}>
              <span className="text-left">
                {o.supplier?.name}
                <span className="block text-xs text-muted-foreground">{tf("Pack of {size} · min {min}", { size: o.pack_size ?? 1, min: o.min_order_packs ?? 1 }, locale)}</span>
              </span>
              <strong>{rupees(o.price)}</strong>
            </Button>
          ))}
          <label className="text-sm" htmlFor="packs">{t("Packs", locale)}</label>
          <input id="packs" className="page-search" type="number" min={option?.min_order_packs ?? 1} inputMode="numeric" value={packs} onChange={(e) => setPacks(e.target.value)} />
          <div className="flex justify-between border-t pt-3">
            <strong>{t("Total", locale)}</strong>
            <strong>{rupees((option?.price ?? 0) * nPacks)}</strong>
          </div>
          <Button disabled={placing || !option || nPacks < (option.min_order_packs ?? 1)} onClick={() => void place()}>
            {placing ? t("Placing…", locale) : t("Place order", locale)}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>{detail?.supplier?.name}</DialogTitle>
          <DialogDescription>{orderStatusLabel(detail?.status, locale)} · {rupees(detail?.total)}</DialogDescription>
          {detail && (
            <OrderRouteMap
              supplier={{ label: detail.supplier?.name ?? t("Supplier", locale), location: detail.supplier?.location }}
              shop={{ label: detail.shop?.name ?? t("Your shop", locale), location: detail.shop?.location }}
            />
          )}
          <section className="order-tracking" aria-label={t("Order tracking", locale)}>
            <div className="order-tracking-heading">
              <h3>{t("Tracking history", locale)}</h3>
              <p>{eta ? tf("Expected {time}", { time: formatTimestamp(eta, locale) }, locale) : t("No ETA provided", locale)}</p>
            </div>
            {tracking.length ? (
              <ol>
                {tracking.map((event, index) => (
                  <li key={`${event.at}-${event.status}-${index}`}>
                    <strong>{event.status ? orderStatusLabel(event.status, locale) : t("Order update", locale)}</strong>
                    <time dateTime={event.at}>{formatTimestamp(event.at!, locale)}</time>
                    {event.note && <p>{event.note}</p>}
                    {event.eta && Number.isFinite(Date.parse(event.eta)) && (
                      <p>{tf("ETA updated to {time}", { time: formatTimestamp(event.eta, locale) }, locale)}</p>
                    )}
                  </li>
                ))}
              </ol>
            ) : <p>{t("No tracking updates yet.", locale)}</p>}
          </section>
          <div className="border-y py-3 text-sm space-y-1">
            {(detail?.items ?? []).map((l) => (
              <p key={l.product_id}>{tf(l.packs === 1 ? "{name} · {n} pack × {price}" : "{name} · {n} packs × {price}", { name: l.name ?? "", n: l.packs ?? 0, price: rupees(l.unit_price) }, locale)}</p>
            ))}
          </div>

          {detail?.status === "delivered" && (
            <Button disabled={receive.isPending} onClick={() => void doReceive(detail)}>
              {receive.isPending ? t("Saving…", locale) : t("Confirm everything arrived", locale)}
            </Button>
          )}
          {detail?.status === "placed" && (
            <Button variant="outline" onClick={() => void doCancel(detail)}>{t("Cancel order", locale)}</Button>
          )}
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
