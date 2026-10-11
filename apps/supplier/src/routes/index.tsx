import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Package, TrendingUp, Users } from "lucide-react";
import { AppShell, PageHeader } from "@/components/kn/AppShell";
import { EmptyState, ErrorState, ListSkeleton, OrderPill } from "@/components/kn/states";
import { q } from "@/lib/api/service";
import { ago, inr } from "@/lib/format";
import { seo } from "@/lib/seo";
import type { OrderStatus } from "@/lib/api/types";

export const Route = createFileRoute("/")({
  head: () => seo("Today", "Incoming retailer orders, deliveries in progress and quick links for KadaNet suppliers."),
  component: Home,
});

function Home() {
  return (
    <AppShell title="Home">
      <HomeBody />
    </AppShell>
  );
}

function HomeBody() {
  const orders = useQuery(q.orders);
  const count = (s: OrderStatus) => orders.data?.filter((o) => o.status === s).length ?? 0;
  const needsAction = orders.data?.filter((o) => o.status === "new") ?? [];
  const recent = orders.data?.filter((o) => o.status === "delivered").slice(0, 3) ?? [];

  return (
    <>
      <PageHeader eyebrow="Supplier overview" title="Today" />

      {orders.isLoading ? (
        <ListSkeleton rows={3} />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Awaiting your decision", v: count("new"), s: "new" },
              { label: "To dispatch", v: count("accepted"), s: "accepted" },
              { label: "Out for delivery", v: count("dispatched"), s: "dispatched" },
              { label: "Delivered", v: count("delivered"), s: "delivered" },
            ].map((m) => (
              <Link key={m.label} to="/orders" search={{ status: m.s as OrderStatus }} className="summary press block">
                <div className="metric">{m.v}</div>
                <div className="eyebrow mt-1">{m.label}</div>
              </Link>
            ))}
          </div>

          <h2 className="section-title mb-3 mt-7">Needs action</h2>
          {needsAction.length === 0 ? (
            <EmptyState title="No new orders" body="New retailer orders will appear here for you to accept or reject." />
          ) : (
            <div className="list-surface">
              {needsAction.map((o) => (
                <Link key={o.id} to="/orders/$id" params={{ id: o.id }} className="product-row hover:bg-secondary/50">
                  <div className="min-w-0 flex-1">
                    <div className="product-name">{o.reference} · {o.retailer.name}</div>
                    <div className="product-sub">{o.items.length} items · {inr(o.total)} · {ago(o.createdAt)}</div>
                  </div>
                  <OrderPill status={o.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </div>
          )}

          {recent.length > 0 && (
            <>
              <h2 className="section-title mb-3 mt-7">Recently completed</h2>
              <div className="list-surface">
                {recent.map((o) => (
                  <Link key={o.id} to="/orders/$id" params={{ id: o.id }} className="product-row">
                    <div className="min-w-0 flex-1">
                      <div className="product-name">{o.reference} · {o.retailer.name}</div>
                      <div className="product-sub">{inr(o.total)}</div>
                    </div>
                    <OrderPill status={o.status} />
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <h2 className="section-title mb-3 mt-7">Shortcuts</h2>
      <div className="list-surface">
        {[
          { to: "/catalogue", icon: Package, t: "Catalogue & prices", s: "Add products, edit wholesale prices" },
          { to: "/demand", icon: TrendingUp, t: "Area demand", s: "Anonymised demand across shops" },
          { to: "/group-buys", icon: Users, t: "Group buys", s: "Tiered prices for pooled orders" },
        ].map(({ to, icon: I, t, s }) => (
          <Link key={to} to={to} className="product-row">
            <div className="product-art"><I className="h-[21px] w-[21px]" aria-hidden /></div>
            <div className="min-w-0 flex-1">
              <div className="product-name">{t}</div>
              <div className="product-sub">{s}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
    </>
  );
}
