import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, ArrowLeft, CheckCircle, Loader2, Minus, Plus, Truck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/api";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { useJoinGroupBuy, useOpenGroupBuys } from "@/features/queries";
import { rupees } from "@/lib/format";
import { clampPacks, isClosed, packSizeLabel, productLabel, tierProgress } from "./helpers";

const plural = (n: number) => `${n} pack${n === 1 ? "" : "s"}`;
const morePacks = (n: number) => `${n} more pack${n === 1 ? "" : "s"}`;

function Back() {
  return (
    <Button variant="ghost" asChild className="-ml-4">
      <Link to="/group-buys">
        <ArrowLeft />
        Back
      </Link>
    </Button>
  );
}

export function GroupBuyDetailPage({ id }: { id: string }) {
  // Every hook is called before any early return below, so the number of hooks never changes
  // between the loading render and the loaded one.
  const buys = useOpenGroupBuys();
  const join = useJoinGroupBuy();
  const [chosenPacks, setChosenPacks] = useState<number | null>(null); // null: not touched yet
  const [error, setError] = useState("");

  if (buys.isLoading) {
    return (
      <Shell active="More">
        <div className="app-main">
          <Back />
          <div className="empty-state" role="status">
            <Loader2 className="animate-spin" />
            <h2>Loading…</h2>
          </div>
        </div>
      </Shell>
    );
  }

  if (buys.isError) {
    return (
      <Shell active="More">
        <div className="app-main">
          <Back />
          <div className="empty-state" role="alert">
            <AlertCircle />
            <h2>Could not load this group buy</h2>
            <p>{buys.error instanceof Error ? buys.error.message : "Please try again."}</p>
            <Button variant="outline" onClick={() => void buys.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  const gb = (buys.data ?? []).find((g) => g.id === id);
  if (!gb) {
    return (
      <Shell active="More">
        <div className="app-main">
          <Back />
          <div className="empty-state">
            <AlertCircle />
            <h2>Group buy not found</h2>
            <p>This group buy is not open to your shop any more. It may have closed.</p>
          </div>
        </div>
      </Shell>
    );
  }

  const mine = gb.my_packs ?? 0;
  const pooled = gb.pooled_packs ?? 0;
  const price = gb.current_price ?? 0;
  const closed = isClosed(gb);
  const progress = tierProgress(gb.tiers, pooled);
  const packs = chosenPacks ?? (mine > 0 ? mine : 1);
  const saving = progress.next ? Math.max(0, price - progress.next.price) : 0;
  const deadline = gb.deadline ? new Date(gb.deadline) : null;

  const onJoin = async () => {
    setError("");
    try {
      await join.mutateAsync({ groupBuyId: gb.id ?? id, packs });
      toast.success(mine > 0 ? "Commitment updated" : "You joined the group buy");
      setChosenPacks(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not join. Check your connection and try again.");
    }
  };

  return (
    <Shell active="More">
      <div className="app-main">
        <Back />
        <div className="space-y-6">
          <div>
            <p className="eyebrow">Group buy</p>
            <h1 className="mt-2">{productLabel(gb.product)}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Truck className="h-3.5 w-3.5" />
              {gb.supplier?.name ?? "Supplier"}
            </p>
          </div>

          <div className="list-surface space-y-4 p-4">
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div>
                <div className="text-2xl font-bold">{rupees(price)}</div>
                <div className="text-xs text-muted-foreground">Price per pack now</div>
              </div>
              <div>
                <div className="font-bold">{pooled}</div>
                <div className="text-xs text-muted-foreground">Packs pooled</div>
              </div>
              <div>
                <div className="font-bold">
                  {closed ? "Closed" : deadline ? formatDistanceToNow(deadline, { addSuffix: true }) : "—"}
                </div>
                <div className="text-xs text-muted-foreground">Deadline</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {packSizeLabel(gb.pack_size, gb.product?.unit)}
              {gb.shops_joined ? ` · ${gb.shops_joined} shop${gb.shops_joined === 1 ? "" : "s"} joined` : ""}
            </p>

            {progress.top > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Price tiers</span>
                  <span className="font-medium">
                    {pooled} / {progress.top} for the best price
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {[...(gb.tiers ?? [])]
                    .sort((a, b) => a.min_packs - b.min_packs)
                    .map((t) => (
                      <li key={t.min_packs} className={pooled >= t.min_packs ? "font-medium text-primary" : ""}>
                        {t.min_packs}+ packs: {rupees(t.price)} a pack
                      </li>
                    ))}
                </ul>
                {progress.next && (
                  <p className="text-xs text-muted-foreground">
                    {morePacks(progress.next.morePacks)} to unlock {rupees(progress.next.price)} a pack
                    {saving > 0 ? ` (saves ${rupees(saving)} a pack)` : ""}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Your commitment</span>
              <span className="font-medium">{mine > 0 ? `${plural(mine)} joined` : "Not joined"}</span>
            </div>
          </div>

          {closed ? (
            <p className="text-sm text-muted-foreground" role="status">
              This group buy is closed, so it no longer takes packs.
            </p>
          ) : (
            <div className="space-y-3">
              <label htmlFor="packs" className="text-sm font-medium">
                Packs to commit
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Fewer packs"
                  onClick={() => setChosenPacks(clampPacks(packs - 1))}
                >
                  <Minus />
                </Button>
                <input
                  id="packs"
                  aria-label="Packs to commit"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={packs}
                  onChange={(e) => setChosenPacks(clampPacks(e.target.value))}
                  className="h-12 w-24 rounded-lg border bg-background px-2 text-center"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="More packs"
                  onClick={() => setChosenPacks(clampPacks(packs + 1))}
                >
                  <Plus />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                About {rupees(packs * price)} at today's price. The final price is set when the deadline passes.
                {mine > 0 ? " This replaces your earlier commitment." : ""}
              </p>
              {error && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              )}
              <Button className="w-full" disabled={join.isPending} onClick={() => void onJoin()}>
                {join.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Joining…
                  </>
                ) : mine > 0 ? (
                  <>
                    <CheckCircle />
                    Update commitment
                  </>
                ) : (
                  <>
                    <Users />
                    Join group buy
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
