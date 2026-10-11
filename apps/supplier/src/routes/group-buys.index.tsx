import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/kn/AppShell";
import { EmptyState, ErrorState, GroupBuyPill, ListSkeleton } from "@/components/kn/states";
import { Button } from "@/components/ui/button";
import { q } from "@/lib/api/service";
import { dateOnly, inr, pack } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/group-buys/")({
  head: () => seo("Group buys", "Create and monitor tiered-price group buys for retailers."),
  component: () => (
    <AppShell title="Group buys">
      <GroupBuys />
    </AppShell>
  ),
});

function GroupBuys() {
  const gb = useQuery(q.groupBuys);
  return (
    <>
      <PageHeader
        eyebrow="Pooled orders"
        title="Group buys"
        action={<Button asChild><Link to="/group-buys/new"><Plus /> New</Link></Button>}
      />
      {gb.isLoading ? (
        <ListSkeleton />
      ) : gb.isError ? (
        <ErrorState error={gb.error} onRetry={() => gb.refetch()} />
      ) : !gb.data?.length ? (
        <EmptyState
          title="No group buys yet"
          body="Offer lower prices when enough shops order together before a deadline."
          action={<Button asChild><Link to="/group-buys/new"><Plus /> Create group buy</Link></Button>}
        />
      ) : (
        <div className="list-surface">
          {gb.data.map((g) => (
            <Link key={g.id} to="/group-buys/$id" params={{ id: g.id }} className="product-row hover:bg-secondary/50">
              <div className="min-w-0 flex-1">
                <div className="product-name">{g.productName} · {pack(g.packSize, g.unit)}</div>
                <div className="product-sub">
                  From {inr(Math.min(...g.tiers.map((t) => t.price)))} · Ends {dateOnly(g.deadline)}
                  {g.committedPacks !== undefined && ` · ${g.committedPacks} packs pledged`}
                </div>
              </div>
              <GroupBuyPill status={g.status} />
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
