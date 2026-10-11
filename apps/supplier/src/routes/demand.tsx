import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, TrendingUp } from "lucide-react";
import { AppShell, PageHeader } from "@/components/kn/AppShell";
import { EmptyState, ErrorState, ListSkeleton, Pill } from "@/components/kn/states";
import { q } from "@/lib/api/service";
import { pack } from "@/lib/format";
import { DEMAND_MIN_SHOPS, shopBand } from "@/lib/rules";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/demand")({
  head: () => seo("Area demand", "Anonymised, aggregated product demand across shops in your service area."),
  component: () => (
    <AppShell title="Demand">
      <Demand />
    </AppShell>
  ),
});

function Demand() {
  const demand = useQuery(q.demand);
  return (
    <>
      <PageHeader eyebrow="Your service area" title="Demand" />
      <div className="mb-5 flex gap-3 rounded-[28px] bg-accent p-4 text-sm text-accent-foreground">
        <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
        <p>
          This summarises what many shops are ordering. It never shows which shops. A product only appears when at least {DEMAND_MIN_SHOPS} shops contribute.
        </p>
      </div>
      {demand.isLoading ? (
        <ListSkeleton />
      ) : demand.isError ? (
        <ErrorState error={demand.error} onRetry={() => demand.refetch()} />
      ) : !demand.data?.length ? (
        <EmptyState title="Not enough aggregated data" body="There isn't enough demand from multiple shops in your area to show yet. Check back later." />
      ) : (
        <div className="list-surface">
          {demand.data.map((d) => (
            <div key={d.productName + d.packSize} className="product-row">
              <div className="product-art"><TrendingUp className="h-[21px] w-[21px]" aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <div className="product-name">{d.productName}</div>
                <div className="product-sub">
                  {d.category} · {pack(d.packSize, d.unit)} packs · {d.period}
                </div>
              </div>
              <div className="text-right">
                <div className="product-name tabular">{d.totalPacks} packs</div>
                <Pill tone="neutral">{shopBand(d.shopCount)}</Pill>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
