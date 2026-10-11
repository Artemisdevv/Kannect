import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info } from "lucide-react";
import { AppShell } from "@/components/kn/AppShell";
import { ErrorState, GroupBuyPill, ListSkeleton } from "@/components/kn/states";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { q } from "@/lib/api/service";
import { ApiError } from "@/lib/api/client";
import { dateTime, inr, pack } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/group-buys/$id")({
  head: () => seo("Group buy", "Progress, price tiers and status of a group buy."),
  component: () => (
    <AppShell title="Group buy">
      <Detail />
    </AppShell>
  ),
});

function Detail() {
  const { id } = Route.useParams();
  const gb = useQuery(q.groupBuys);
  if (gb.isLoading) return <ListSkeleton />;
  if (gb.isError) return <ErrorState error={gb.error} onRetry={() => gb.refetch()} />;
  const g = gb.data?.find((x) => x.id === id);
  if (!g) return <ErrorState error={new ApiError("not_found", "Group buy not found.")} />;

  const tiers = [...g.tiers].sort((a, b) => a.minPacks - b.minPacks);
  const top = tiers[tiers.length - 1]?.minPacks ?? 1;
  const committed = g.committedPacks;

  return (
    <>
      <Button asChild variant="ghost" className="-ml-4 mb-2">
        <Link to="/group-buys"><ArrowLeft /> Group buys</Link>
      </Button>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Deadline {dateTime(g.deadline)}</p>
          <h1>{g.productName}</h1>
          <p className="text-sm text-muted-foreground">{pack(g.packSize, g.unit)} pack</p>
        </div>
        <GroupBuyPill status={g.status} />
      </div>

      <div className="summary mb-5">
        <p className="eyebrow">Pledged so far (all shops combined)</p>
        {committed === undefined ? (
          <p className="mt-1 text-sm text-muted-foreground">Progress isn't available yet.</p>
        ) : (
          <>
            <div className="metric">{committed} <span className="text-base font-medium text-muted-foreground">packs</span></div>
            <Progress value={Math.min(100, (committed / top) * 100)} className="mt-3 h-2 bg-muted" aria-label="Progress toward top tier" />
            {g.participantCount !== undefined && (
              <p className="mt-2 text-xs text-muted-foreground">{g.participantCount} participating shops (identities not shown)</p>
            )}
          </>
        )}
      </div>

      <h2 className="section-title mb-3">Price tiers</h2>
      <div className="list-surface">
        {tiers.map((t) => {
          const reached = committed !== undefined && committed >= t.minPacks;
          return (
            <div key={t.minPacks} className="product-row">
              <div className="min-w-0 flex-1">
                <div className="product-name">{t.minPacks}+ packs</div>
                <div className="product-sub">{inr(t.price)} per {pack(g.packSize, g.unit)} pack</div>
              </div>
              <span className={`status-pill ${reached ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                {reached ? "Pledges reached" : "Not reached"}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 flex gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" aria-hidden />
        The final price is confirmed only if pledges meet a tier by the deadline. Status changes to “confirmed” only once the server confirms it.
      </p>
    </>
  );
}
