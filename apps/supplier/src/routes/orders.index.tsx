import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { AppShell, PageHeader } from "@/components/kn/AppShell";
import { EmptyState, ErrorState, ListSkeleton, ORDER_LABEL, OrderPill } from "@/components/kn/states";
import { q } from "@/lib/api/service";
import { ago, inr } from "@/lib/format";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/api/types";

const FILTERS: (OrderStatus | "all")[] = ["all", "new", "accepted", "dispatched", "delivered", "rejected"];
const URGENCY: Record<OrderStatus, number> = { new: 0, accepted: 1, dispatched: 2, delivered: 3, rejected: 4 };

export const Route = createFileRoute("/orders/")({
  validateSearch: (s: Record<string, unknown>): { status?: OrderStatus } =>
    FILTERS.includes(s["status"] as OrderStatus) && s["status"] !== "all" ? { status: s["status"] as OrderStatus } : {},
  head: () => seo("Orders", "Incoming retailer purchase orders to accept, dispatch and deliver."),
  component: () => (
    <AppShell title="Orders">
      <Orders />
    </AppShell>
  ),
});

function Orders() {
  const { status } = Route.useSearch();
  const orders = useQuery(q.orders);
  const list = (orders.data ?? [])
    .filter((o) => !status || o.status === status)
    .sort((a, b) => URGENCY[a.status] - URGENCY[b.status] || b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader eyebrow="Purchase orders" title="Orders" />
      <div className="-mx-6 mb-4 flex gap-2 overflow-x-auto px-6 pb-1" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => {
          const active = (status ?? "all") === f;
          return (
            <Link
              key={f}
              to="/orders"
              search={f === "all" ? {} : { status: f }}
              role="tab"
              aria-selected={active}
              className={cn(
                "flex min-h-12 shrink-0 items-center rounded-full border px-4 text-sm",
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
              )}
            >
              {f === "all" ? "All" : ORDER_LABEL[f]}
            </Link>
          );
        })}
      </div>
      {orders.isLoading ? (
        <ListSkeleton />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="No orders here" body={status ? "No orders with this status right now." : "When retailers order from your catalogue, they'll show up here."} />
      ) : (
        <div className="list-surface">
          {list.map((o) => (
            <Link key={o.id} to="/orders/$id" params={{ id: o.id }} className="product-row hover:bg-secondary/50">
              <div className="min-w-0 flex-1">
                <div className="product-name truncate">{o.reference} · {o.retailer.name}</div>
                <div className="product-sub">
                  {o.items.reduce((s, i) => s + i.quantity, 0)} packs · {inr(o.total)} · {ago(o.createdAt)}
                </div>
              </div>
              <OrderPill status={o.status} />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
