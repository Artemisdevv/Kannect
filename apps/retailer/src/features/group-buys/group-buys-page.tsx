import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, ChevronRight, Loader2, Truck, Users } from "lucide-react";

import type { GroupBuy } from "@/api";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { useOpenGroupBuys } from "@/features/queries";
import { rupees } from "@/lib/format";
import { isClosed, packSizeLabel, productLabel, tierProgress } from "./helpers";

const plural = (n: number) => `${n} pack${n === 1 ? "" : "s"}`;
const morePacks = (n: number) => `${n} more pack${n === 1 ? "" : "s"}`;

function Card({ gb }: { gb: GroupBuy }) {
  const pooled = gb.pooled_packs ?? 0;
  const mine = gb.my_packs ?? 0;
  const progress = tierProgress(gb.tiers, pooled);
  const deadline = gb.deadline ? new Date(gb.deadline) : null;

  return (
    <article className="list-surface space-y-3 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{productLabel(gb.product)}</h3>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="h-3.5 w-3.5" />
            {gb.supplier?.name ?? "Supplier"}
          </p>
          <p className="text-xs text-muted-foreground">{packSizeLabel(gb.pack_size, gb.product?.unit)}</p>
        </div>
        {mine > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Users className="h-3 w-3" />
            Joined {plural(mine)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div>
          <div className="text-2xl font-bold">{rupees(gb.current_price ?? 0)}</div>
          <div className="text-xs text-muted-foreground">a pack now</div>
        </div>
        <div>
          <div className="font-bold">{pooled}</div>
          <div className="text-xs text-muted-foreground">Packs pooled</div>
        </div>
        <div>
          <div className="font-bold">{deadline ? formatDistanceToNow(deadline, { addSuffix: true }) : "—"}</div>
          <div className="text-xs text-muted-foreground">Deadline</div>
        </div>
      </div>

      {progress.top > 0 && (
        <div className="space-y-1 border-t pt-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          {progress.next && (
            <p className="text-xs text-muted-foreground">
              {morePacks(progress.next.morePacks)} to unlock {rupees(progress.next.price)} a pack
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button variant="outline" asChild>
          <Link to="/group-buys/$id" params={{ id: gb.id ?? "" }}>
            <span className="flex items-center gap-2">
              View details <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function GroupBuysPage() {
  const buys = useOpenGroupBuys();

  if (buys.isLoading) {
    return (
      <Shell active="More">
        <div className="app-main">
          <div className="empty-state" role="status">
            <Loader2 className="animate-spin" />
            <h2>Loading group buys…</h2>
          </div>
        </div>
      </Shell>
    );
  }

  if (buys.isError) {
    return (
      <Shell active="More">
        <div className="app-main">
          <div className="empty-state" role="alert">
            <AlertCircle />
            <h2>Could not load group buys</h2>
            <p>{buys.error instanceof Error ? buys.error.message : "Please try again."}</p>
            <Button variant="outline" onClick={() => void buys.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  const open = (buys.data ?? []).filter((gb) => !isClosed(gb));
  const joined = open.filter((gb) => (gb.my_packs ?? 0) > 0);
  const others = open.filter((gb) => (gb.my_packs ?? 0) === 0);

  return (
    <Shell active="More">
      <div className="app-main">
        <div className="eyebrow">Procurement</div>
        <h1 className="mt-2">Group buys</h1>
        <p className="mt-1 text-sm text-muted-foreground">Join other shops to unlock lower wholesale prices.</p>

        {joined.length > 0 && (
          <section className="mt-6">
            <div className="section-heading">
              <h2>You joined</h2>
            </div>
            <div className="space-y-3">
              {joined.map((gb) => (
                <Card key={gb.id} gb={gb} />
              ))}
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section className="mt-6">
            <div className="section-heading">
              <h2>Available</h2>
            </div>
            <div className="space-y-3">
              {others.map((gb) => (
                <Card key={gb.id} gb={gb} />
              ))}
            </div>
          </section>
        )}

        {open.length === 0 && (
          <div className="empty-state mt-12">
            <Users />
            <h2>No open group buys</h2>
            <p>Check back later. Suppliers near you post new deals regularly.</p>
          </div>
        )}
      </div>
    </Shell>
  );
}
