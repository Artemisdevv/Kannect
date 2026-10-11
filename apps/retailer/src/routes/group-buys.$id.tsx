import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Users, ChevronRight, Tag, Truck, Clock, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { rupees } from "@/lib/format";

import { pageHead } from "@/components/kannect/shell";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useOpenGroupBuys, useJoinGroupBuy } from "@/features/queries";

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

export const Route = createFileRoute("/group-buys/$id")({
  head: () => ({
    meta: [
      { title: "Group buy details — Kannect" },
      { name: "description", content: "View group buy details and join with other shops." },
    ],
  }),
  component: GroupBuyDetailPage,
});

function GroupBuyDetailPage() {
  const { id } = Route.useParams();
  const { data: groupBuys, isLoading, isError, error } = useOpenGroupBuys();
  const groupBuy = groupBuys?.find((gb) => gb.id === id);

  if (isLoading || !groupBuy) {
    return (
      <Shell active="More">
        <div className="app-main">
          <Button variant="ghost" asChild className="-ml-4"><Link to="/group-buys"><ArrowLeft />Back</Link></Button>
          <div className="empty-state" role="status">
            <svg className="animate-spin h-10 w-10 text-primary" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            <h2>Loading…</h2>
          </div>
        </div>
      </Shell>
    );
  }

  if (isError || !groupBuy) {
    return (
      <Shell active="More">
        <div className="app-main">
          <Button variant="ghost" asChild className="-ml-4"><Link to="/group-buys"><ArrowLeft />Back</Link></Button>
          <div className="empty-state" role="alert">
            <AlertCircle />
            <h2>{!groupBuy ? "Group buy not found" : "Could not load details"}</h2>
            <p>{error instanceof Error ? error.message : "Please try again later."}</p>
            <Button variant="outline" asChild><Link to="/group-buys">Back to list</Link></Button>
          </div>
        </div>
      </Shell>
    );
  }

  const supplierName = groupBuy.supplier?.name ?? "Unknown supplier";
  const productName = groupBuy.product?.name ?? "Unknown product";
  const packSize = groupBuy.product?.pack_size ?? 1;
  const basePrice = groupBuy.base_price ?? 0;
  const tiers = groupBuy.tiers ?? [];
  const pooled = groupBuy.pooled_packs ?? 0;
  const currentTier = tiers.filter((t) => t.min_packs <= pooled).pop() ?? tiers[0];
  const next = tiers.find((t) => t.min_packs > pooled) ?? null;
  const deadline = new Date(groupBuy.deadline);
  const isExpired = deadline < new Date();
  const myPacks = groupBuy.member_packs ?? 0;
  const currentPrice = currentTier?.price ?? basePrice;
  const savings = basePrice - currentPrice;

  const joinMutation = useJoinGroupBuy();
  const [joinPacks, setJoinPacks] = useState(1);

  const handleJoin = async () => {
    try {
      await joinMutation.mutateAsync({ groupBuyId: groupBuy.id, packs: joinPacks });
    } catch (e) {
      console.error("Failed to join group buy:", e);
    }
  };

  return (
    <Shell active="More">
      <div className="app-main">
        <Button variant="ghost" asChild className="-ml-4"><Link to="/group-buys"><ArrowLeft />Back</Link></Button>

        <div className="space-y-6">
          <div>
            <p className="eyebrow">Group buy detail</p>
            <h1 className="mt-2">{productName}</h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <Truck className="h-3.5 w-3.5" />
              {supplierName}
            </p>
          </div>

          <div className="list-surface p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div>
                <div className="text-2xl font-bold">{rupees(currentPrice)}</div>
                <div className="text-xs text-muted-foreground">Current price / pack</div>
                {savings > 0 && <div className="text-xs text-green-600 mt-1">Save {rupees(savings)}/pack</div>}
              </div>
              <div>
                <div className="font-bold">{pooled}</div>
                <div className="text-xs text-muted-foreground">Packs pooled</div>
              </div>
              <div>
                <div className="font-bold">
                  {isExpired ? <span className="text-destructive">Expired</span> : formatDistanceToNow(deadline, { addSuffix: true })}
                </div>
                <div className="text-xs text-muted-foreground">Deadline</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{packSize} units per pack</span>
              <span className="font-medium">{rupees(basePrice)}/pack base price</span>
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

            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Your commitment</span>
                <span className="font-medium">{myPacks > 0 ? `${myPacks} pack${myPacks > 1 ? "s" : ""} joined` : "Not joined"}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${myPacks > 0 ? 100 : 0}%` }} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t">
            {groupBuy.status === "open" && !isExpired && (
              <>
                <Button variant="outline" asChild><Link to="/group-buys"><ArrowLeft className="h-4 w-4 mr-2" />Back to list</Link></Button>
                <Button
                  variant={myPacks > 0 ? "default" : "default"}
                  onClick={() => handleJoin()}
                  disabled={joinMutation.isPending || isExpired}
                >
                  {joinMutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Joining…
                    </>
                  ) : myPacks > 0 ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Update commitment
                    </>
                  ) : (
                    <>
                      <Users className="h-4 w-4 mr-2" />
                      Join group buy
                    </>
                  )}
                </Button>
              </>
            )}
            {groupBuy.status !== "open" || isExpired ? (
              <Button variant="outline" asChild><Link to="/group-buys"><ArrowLeft className="h-4 w-4 mr-2" />Back to list</Link></Button>
            ) : null}
          </div>
        </div>

        <Dialog open={false} onOpenChange={() => {}}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Join group buy</DialogTitle>
              <DialogDescription>
                Commit packs to this group buy. The price will be confirmed when the deadline passes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="packs" className="text-sm font-medium">Packs to commit</label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setJoinPacks((p) => Math.max(1, p - 1))}>-</Button>
                  <input
                    id="packs"
                    type="number"
                    min="1"
                    max={100}
                    value={joinPacks}
                    onChange={(e) => setJoinPacks(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-center border rounded-lg px-2 py-1"
                  />
                  <Button variant="outline" size="icon" onClick={() => setJoinPacks((p) => p + 1)}>+</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {joinPacks} pack{joinPacks > 1 ? "s" : ""} × {rupees(currentPrice)} = {rupees(joinPacks * currentPrice)}
                </p>
              </div>
              {myPacks > 0 && (
                <p className="text-xs text-muted-foreground">You already joined {myPacks} pack{myPacks > 1 ? "s" : ""}. This will update your commitment.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {}}>Cancel</Button>
              <Button onClick={() => {}} disabled={joinMutation.isPending}>
                {joinMutation.isPending ? "Joining…" : myPacks > 0 ? "Update commitment" : "Join group buy"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}