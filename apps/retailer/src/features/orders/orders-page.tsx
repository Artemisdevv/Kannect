import { ChevronRight, Leaf, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, cancelOrder, placeOrder } from "@/api";
import { Heading, Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { keys, useOrders, useReceiveOrder, useReorderSuggestions } from "@/features/queries";
import { OrderRouteMap } from "@/features/orders/order-route-map";
import { newId, rupees } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

type Suggestion = NonNullable<ReturnType<typeof useReorderSuggestions>["data"]>[number];
type Order = NonNullable<ReturnType<typeof useOrders>["data"]>[number];
type TrackingEvent = NonNullable<Order["tracking"]>[number];

const STATUS_TEXT: Record<string, string> = {
  placed: "Waiting for supplier",
  accepted: "Accepted",
  rejected: "Rejected",
  dispatched: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

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

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function OrdersPage() {
  const orders = useOrders();
  const suggestions = useReorderSuggestions();
  const receive = useReceiveOrder();
  const qc = useQueryClient();
  const [list, setList] = useState(false);
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
      toast.success("Order placed");
      setPicked(null);
      setList(false);
      await qc.invalidateQueries({ queryKey: keys.orders });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not place the order.");
    } finally {
      setPlacing(false);
    }
  };

  const doReceive = async (o: Order) => {
    try {
      await receive.mutateAsync(o.id as string);
      toast.success("Received into your stock");
      setDetail(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not record the delivery.");
    }
  };

  const doCancel = async (o: Order) => {
    try {
      await cancelOrder(o.id as string);
      await qc.invalidateQueries({ queryKey: keys.orders });
      setDetail(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not cancel the order.");
    }
  };

  const count = suggestions.data?.length ?? 0;
  const tracking = chronologicalTracking(detail?.tracking);
  const eta = latestEta(tracking);

  return (
    <Shell active="Orders">
      <p className="eyebrow">Restock your shop</p>
      <h1>Orders</h1>
      <Button variant="secondary" className="w-full mt-3 justify-between" onClick={() => setList(true)}>
        <span className="flex items-center gap-2">
          <Leaf />
          {count} reorder suggestion{count === 1 ? "" : "s"}
        </span>
        <ChevronRight />
      </Button>

      <Heading title="Your orders" />
      {orders.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {orders.data && orders.data.length === 0 && (
        <p className="text-muted-foreground text-sm">No orders yet. Start from a suggestion above.</p>
      )}
      <div className="list-surface">
        {(orders.data ?? []).map((o) => (
          <button key={o.id} type="button" className="order-preview w-full text-left" onClick={() => setDetail(o)}>
            <Truck className="text-primary" />
            <div className="min-w-0">
              <div className="product-name">{o.supplier?.name}</div>
              <div className="product-sub">
                {o.items?.length ?? 0} item{(o.items?.length ?? 0) === 1 ? "" : "s"} · {rupees(o.total)}
              </div>
            </div>
            <span className="status-pill">{STATUS_TEXT[o.status ?? ""] ?? o.status}</span>
          </button>
        ))}
      </div>

      <Dialog open={list} onOpenChange={setList}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>Reorder suggestions</DialogTitle>
          <DialogDescription>Low or out of stock, with suppliers near you. Nothing is ordered until you confirm.</DialogDescription>
          {suggestions.data?.length === 0 && <p className="text-sm">Nothing needs restocking.</p>}
          {(suggestions.data ?? []).map((s) => (
            <button key={s.shop_product?.product?.id} type="button" className="border-b py-3 text-left" onClick={() => choose(s)}>
              <strong className="text-sm">{s.shop_product?.product?.name}</strong>
              <p className="text-xs text-muted-foreground">{s.reason}</p>
              <p className="text-xs text-primary">
                {s.options?.length ?? 0} supplier{(s.options?.length ?? 0) === 1 ? "" : "s"} · suggest {s.suggested_packs} pack{s.suggested_packs === 1 ? "" : "s"}
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
                <span className="block text-xs text-muted-foreground">Pack of {o.pack_size} · min {o.min_order_packs ?? 1}</span>
              </span>
              <strong>{rupees(o.price)}</strong>
            </Button>
          ))}
          <label className="text-sm" htmlFor="packs">Packs</label>
          <input id="packs" className="page-search" type="number" min={option?.min_order_packs ?? 1} inputMode="numeric" value={packs} onChange={(e) => setPacks(e.target.value)} />
          <div className="flex justify-between border-t pt-3">
            <strong>Total</strong>
            <strong>{rupees((option?.price ?? 0) * nPacks)}</strong>
          </div>
          <Button disabled={placing || !option || nPacks < (option.min_order_packs ?? 1)} onClick={() => void place()}>
            {placing ? "Placing…" : "Place order"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>{detail?.supplier?.name}</DialogTitle>
          <DialogDescription>{STATUS_TEXT[detail?.status ?? ""] ?? detail?.status} · {rupees(detail?.total)}</DialogDescription>
          {detail && (
            <OrderRouteMap
              supplier={{ label: detail.supplier?.name ?? "Supplier", location: detail.supplier?.location }}
              shop={{ label: detail.shop?.name ?? "Your shop", location: detail.shop?.location }}
            />
          )}
          <section className="order-tracking" aria-label="Order tracking">
            <div className="order-tracking-heading">
              <h3>Tracking history</h3>
              <p>{eta ? `Expected ${formatTimestamp(eta)}` : "No ETA provided"}</p>
            </div>
            {tracking.length ? (
              <ol>
                {tracking.map((event, index) => (
                  <li key={`${event.at}-${event.status}-${index}`}>
                    <strong>{STATUS_TEXT[event.status ?? ""] ?? event.status ?? "Order update"}</strong>
                    <time dateTime={event.at}>{formatTimestamp(event.at!)}</time>
                    {event.note && <p>{event.note}</p>}
                    {event.eta && Number.isFinite(Date.parse(event.eta)) && (
                      <p>ETA updated to {formatTimestamp(event.eta)}</p>
                    )}
                  </li>
                ))}
              </ol>
            ) : <p>No tracking updates yet.</p>}
          </section>
          <div className="border-y py-3 text-sm space-y-1">
            {(detail?.items ?? []).map((l) => (
              <p key={l.product_id}>{l.name} · {l.packs} pack{l.packs === 1 ? "" : "s"} × {rupees(l.unit_price)}</p>
            ))}
          </div>

          {detail?.status === "delivered" && (
            <Button disabled={receive.isPending} onClick={() => void doReceive(detail)}>
              {receive.isPending ? "Saving…" : "Confirm everything arrived"}
            </Button>
          )}
          {detail?.status === "placed" && (
            <Button variant="outline" onClick={() => void doCancel(detail)}>Cancel order</Button>
          )}
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
