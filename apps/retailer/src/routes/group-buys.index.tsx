import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, ChevronRight, Tag, Truck, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { rupees } from "@/lib/format";

import { pageHead } from "@/components/kannect/shell";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { useOpenGroupBuys } from "@/features/queries";

type GroupBuy = {
  id: string;
  supplier: { name: string; location?: { lat: number; lng: number } | null };
  product: { name: string; pack_size: number };
  base_price: number;
  tiers: { min_packs: number; price: number }[];
  deadline: string;
  pooled_packs: number;
  status: "open" | "confirmed" | "failed";
  member_packs?: number;
};

function bestTier(tiers: { min_packs: number; price: number }[], pooled: number) {
  const eligible = tiers.filter((t) => t.min_packs <= pooled);
  return eligible.length > 0 ? eligible[eligible.length - 1] : tiers[0];
}

function nextTier(tiers: { min_packs: number; price: number }[], pooled: number) {
  const upcoming = tiers.filter((t) => t.min_packs > pooled);
  return upcoming[0] ?? null;
}

export const Route = createFileRoute("/group-buys/")({
  head: () => ({
    meta: [
      { title: "Group buys — Kannect" },
      { name: "description", content: "Join supplier group buys with other shops to unlock lower prices." },
    ],
  }),
  component: GroupBuysPage,
});

function GroupBuysPage() {
  const { data: groupBuys, isLoading, isError, error } = useQuery({
    queryKey: ["group-buys", "open"],
    queryFn: async () => (await (await import("@/api")).listOpenGroupBuys()).items ?? [],
  });

  if (isLoading) {
    return (
      <Shell active="More">
        <div className="app-main">
          <div className="empty-state" role="status">
            <svg className="animate-spin h-10 w-10 text-primary" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            <h2>Loading group buys…</h2>
          </div>
        </div>
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell active="More">
        <div className="app-main">
          <div className="empty-state" role="alert">
            <AlertCircle />
            <h2>Could not load group buys</h2>
            <p>{error instanceof Error ? error.message : "Please try again later."}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
          </div>
        </div>
      </Shell>
    );
  }

  const openBuys = (groupBuys ?? []).filter((gb) => gb.status === "open");
  const myBuys = (groupBuys ?? []).filter((gb) => gb.status === "open" && (gb.member_packs ?? 0) > 0);
  const otherBuys = openBuys.filter((gb) => (gb.member_packs ?? 0) === 0);

  return (
    <Shell active="More">
      <div className="app-main">
        <div className="eyebrow">Procurement</div>
        <h1 className="mt-2">Group buys</h1>
        <p className="text-sm text-muted-foreground mt-1">Join other shops to unlock lower wholesale prices.</p>

        {myBuys.length > 0 && (
          <section className="mt-6">
            <div className="section-heading">
              <h2>You joined</h2>
            </div>
            <div className="space-y-3">
              {myBuys.map((gb) => <GroupBuyCard key={gb.id} groupBuy={gb} showJoined />)}
            </div>
          </section>
        )}

        {otherBuys.length > 0 && (
          <section className="mt-6">
            <div className="section-heading">
              <h2>Available</h2>
            </div>
            <div className="space-y-3">
              {otherBuys.map((gb) => <GroupBuyCard key={gb.id} groupBuy={gb} />)}
            </div>
          </section>
        )}

        {(myBuys.length === 0 && otherBuys.length === 0) && (
          <div className="empty-state mt-12">
            <Users />
            <h2>No open group buys</h2>
            <p>Check back later — suppliers post new deals regularly.</p>
          </div>
        )}
      </div>
    </Shell>
  );
}

function GroupBuyCard({ groupBuy, showJoined }: { groupBuy: GroupBuy; showJoined?: boolean }) {
  const supplierName = groupBuy.supplier?.name ?? "Unknown supplier";
  const productName = groupBuy.product?.name ?? "Unknown product";
  const packSize = groupBuy.product?.pack_size ?? 1;
  const basePrice = groupBuy.base_price ?? 0;
  const tiers = groupBuy.tiers ?? [];
  const pooled = groupBuy.pooled_packs ?? 0;
  const currentTier = bestTier(tiers, pooled);
  const next = nextTier(tiers, pooled);
  const deadline = new Date(groupBuy.deadline);
  const isExpired = deadline < new Date();
  const myPacks = groupBuy.member_packs ?? 0;

  const currentPrice = currentTier?.price ?? basePrice;
  const savings = basePrice - currentPrice;

  return (
    <article className="list-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold truncate">{productName}</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <Truck className="h-3.5 w-3.5" />
            {supplierName}
            {groupBuy.supplier?.location && (
              <>
                <span className="h-3 w-0.5 bg-muted rounded-full" />
                <span className="text-xs">Delivers to you</span>
              </>
            )}
          </p>
        </div>
        {showJoined && myPacks > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <Users className="h-3 w-3" />
            Joined {myPacks} pack{myPacks > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div>
          <div className="text-2xl font-bold">{rupees(currentPrice)}</div>
          <div className="text-xs text-muted-foreground">/ pack</div>
          {savings > 0 && (
            <div className="text-xs text-green-600 mt-1">Save {rupees(savings)}/pack</div>
          )}
        </div>
        <div>
          <div className="font-bold">{pooled}</div>
          <div className="text-xs text-muted-foreground">Packs pooled</div>
        </div>
        <div>
          <div className="font-bold">
            {isExpired ? (
              <span className="text-destructive">Expired</span>
            ) : (
              <>
                {formatDistanceToNow(deadline, { addSuffix: true })}
                <Clock className="h-3 w-3 inline ml-1" />
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground">Deadline</div>
        </div>
      </div>

      {tiers.length > 1 && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Price tiers</span>
            <span className="font-medium">{pooled} / {tiers[tiers.length - 1].min_packs} for best price</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, (pooled / tiers[tiers.length - 1].min_packs) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            {tiers.map((t) => (
              <span key={t.min_packs} className={pooled >= t.min_packs ? "font-medium text-primary" : ""}>
                {t.min_packs}+ packs → {rupees(t.price)}/pack
              </span>
            ))}
          </div>
          {next && pooled < next.min_packs && (
            <p className="text-xs text-muted-foreground">
              {next.min_packs - pooled} more pack{next.min_packs - pooled > 1 ? "s" : ""} to unlock {rupees(next.price)}/pack
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" asChild>
          <Link to={`/group-buys/${groupBuy.id}`}>
            <span className="flex items-center gap-2">View details <ChevronRight className="h-4 w-4" /></span>
          </Link>
        </Button>
      </div>
    </article>
  );
}