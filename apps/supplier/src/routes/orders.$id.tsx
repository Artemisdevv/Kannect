import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/kn/AppShell";
import { ErrorState, ListSkeleton, ORDER_LABEL, OrderPill, errorText } from "@/components/kn/states";
import { ConfirmDialog } from "@/components/kn/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { api, q } from "@/lib/api/service";
import { ApiError } from "@/lib/api/client";
import { dateTime, inr, pack } from "@/lib/format";
import { ORDER_TRANSITIONS } from "@/lib/rules";
import { seo } from "@/lib/seo";
import type { OrderStatus } from "@/lib/api/types";

export const Route = createFileRoute("/orders/$id")({
  head: () => seo("Order details", "Review a retailer order, accept or reject it, and update delivery status."),
  component: () => (
    <AppShell title="Order">
      <OrderDetail />
    </AppShell>
  ),
});

const ACTION: Record<OrderStatus, { label: string; body: string; destructive?: boolean }> = {
  accepted: { label: "Accept order", body: "The retailer will be told you've accepted this order. An invoice is generated if the server supports it." },
  rejected: { label: "Reject order", body: "The retailer will be told you can't fulfil this order. This can't be undone.", destructive: true },
  dispatched: { label: "Confirm dispatch", body: "Mark this order as dispatched only once goods have left your warehouse." },
  delivered: { label: "Mark delivered", body: "Mark delivered only when the retailer has received the goods." },
  new: { label: "", body: "" },
};

function OrderDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const orders = useQuery(q.orders);
  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const order = orders.data?.find((o) => o.id === id);

  const mut = useMutation({
    mutationFn: (s: OrderStatus) => api.setOrderStatus(id, s),
    onSuccess: (o) => {
      toast.success(`Order ${o.reference} is now ${ORDER_LABEL[o.status].toLowerCase()}.`);
      setConflict(null);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.kind === "conflict") setConflict(e.message);
      else toast.error(errorText(e));
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onSettled: () => setPending(null),
  });

  if (orders.isLoading) return <ListSkeleton />;
  if (orders.isError) return <ErrorState error={orders.error} onRetry={() => orders.refetch()} />;
  if (!order) return <ErrorState error={new ApiError("not_found", "This order wasn't found or isn't yours.")} />;

  const next = ORDER_TRANSITIONS[order.status];

  return (
    <>
      <Button asChild variant="ghost" className="-ml-4 mb-2">
        <Link to="/orders"><ArrowLeft /> Orders</Link>
      </Button>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{dateTime(order.createdAt)}</p>
          <h1>{order.reference}</h1>
          <p className="text-sm text-muted-foreground">{order.retailer.name} · {order.retailer.area}</p>
        </div>
        <OrderPill status={order.status} />
      </div>

      {conflict && (
        <div role="alert" className="mb-4 rounded-[18px] bg-danger-surface px-4 py-3 text-sm text-destructive">
          <b>Status not changed.</b> {conflict}
        </div>
      )}

      {next.length > 0 && (
        <div className="summary mb-5">
          <p className="eyebrow mb-3">Next step</p>
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <Button key={s} variant={ACTION[s].destructive ? "outline" : "default"} size="lg" className="flex-1" disabled={mut.isPending} onClick={() => setPending(s)}>
                {ACTION[s].label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <h2 className="section-title mb-3">Items</h2>
      <div className="list-surface">
        {order.items.map((i) => (
          <div key={i.productId} className="product-row">
            <div className="min-w-0 flex-1">
              <div className="product-name">{i.name}</div>
              <div className="product-sub">
                <span className="rounded bg-muted px-1">{i.sku}</span> · {inr(i.unitPrice)} per {pack(i.packSize, i.unit)} pack
              </div>
            </div>
            <div className="text-right">
              <div className="product-name tabular">× {i.quantity}</div>
              <div className="product-sub tabular">{inr(i.quantity * i.unitPrice)}</div>
            </div>
          </div>
        ))}
        <div className="product-row justify-between bg-elevated">
          <span className="font-semibold">Order total</span>
          <span className="tabular text-lg font-bold">{inr(order.total)}</span>
        </div>
      </div>

      {order.invoiceId && (
        <Button asChild variant="secondary" className="mt-4 w-full">
          <Link to="/invoices/$id" params={{ id: order.invoiceId }}><FileText /> View invoice</Link>
        </Button>
      )}

      <h2 className="section-title mb-3 mt-7">Tracking</h2>
      {order.tracking.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tracking updates are not available yet.</p>
      ) : (
        <ol className="list-surface">
          {[...order.tracking].reverse().map((t, i) => (
            <li key={i} className="product-row">
              <span className={`h-3 w-3 shrink-0 rounded-full ${i === 0 ? "bg-primary" : "bg-border-strong bg-muted-foreground/40"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="product-name">{ORDER_LABEL[t.status]}</div>
                <div className="product-sub">{dateTime(t.at)}{t.note ? ` · ${t.note}` : ""}</div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={`${ACTION[pending].label}?`}
          body={ACTION[pending].body}
          confirmLabel={ACTION[pending].label}
          destructive={!!ACTION[pending].destructive}
          pending={mut.isPending}
          onConfirm={() => mut.mutate(pending)}
        />
      )}
    </>
  );
}
