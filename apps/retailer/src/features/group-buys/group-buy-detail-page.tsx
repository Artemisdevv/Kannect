import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, CheckCircle, Loader2, Minus, Plus, Truck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/api";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { useJoinGroupBuy, useOpenGroupBuys } from "@/features/queries";
import { rupees } from "@/lib/format";
import { t, tf, useLocale } from "@/lib/i18n";
import { clampPacks, deadlineLabel, isClosed, packSizeLabel, productLabel, tierProgress } from "./helpers";

function Back({ locale }: { locale: ReturnType<typeof useLocale> }) {
  return (
    <Button variant="ghost" asChild className="-ml-4">
      <Link to="/group-buys">
        <ArrowLeft />
        {t("Back", locale)}
      </Link>
    </Button>
  );
}

export function GroupBuyDetailPage({ id }: { id: string }) {
  // Every hook is called before any early return below, so the number of hooks never changes
  // between the loading render and the loaded one.
  const locale = useLocale();
  const buys = useOpenGroupBuys();
  const join = useJoinGroupBuy();
  const [chosenPacks, setChosenPacks] = useState<number | null>(null); // null: not touched yet
  const [error, setError] = useState("");

  if (buys.isLoading) {
    return (
      <Shell active="More">
        <div className="app-main">
          <Back locale={locale} />
          <div className="empty-state" role="status">
            <Loader2 className="animate-spin" />
            <h2>{t("Loading…", locale)}</h2>
          </div>
        </div>
      </Shell>
    );
  }

  if (buys.isError) {
    return (
      <Shell active="More">
        <div className="app-main">
          <Back locale={locale} />
          <div className="empty-state" role="alert">
            <AlertCircle />
            <h2>{t("Could not load this group buy", locale)}</h2>
            <p>{buys.error instanceof Error ? buys.error.message : t("Please try again.", locale)}</p>
            <Button variant="outline" onClick={() => void buys.refetch()}>
              {t("Try again", locale)}
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
          <Back locale={locale} />
          <div className="empty-state">
            <AlertCircle />
            <h2>{t("Group buy not found", locale)}</h2>
            <p>{t("This group buy is not open to your shop any more. It may have closed.", locale)}</p>
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
  const shops = gb.shops_joined ?? 0;
  const packsJoined = (n: number) => tf(n === 1 ? "{n} pack joined" : "{n} packs joined", { n }, locale);

  const onJoin = async () => {
    setError("");
    try {
      await join.mutateAsync({ groupBuyId: gb.id ?? id, packs });
      toast.success(t(mine > 0 ? "Commitment updated" : "You joined the group buy", locale));
      setChosenPacks(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("Could not join. Check your connection and try again.", locale));
    }
  };

  return (
    <Shell active="More">
      <div className="app-main">
        <Back locale={locale} />
        <div className="space-y-6">
          <div>
            <p className="eyebrow">{t("Group buy", locale)}</p>
            <h1 className="mt-2">{productLabel(gb.product, locale)}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Truck className="h-3.5 w-3.5" />
              {gb.supplier?.name ?? t("Supplier", locale)}
            </p>
          </div>

          <div className="list-surface space-y-4 p-4">
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div>
                <div className="text-2xl font-bold">{rupees(price)}</div>
                <div className="text-xs text-muted-foreground">{t("Price per pack now", locale)}</div>
              </div>
              <div>
                <div className="font-bold">{pooled}</div>
                <div className="text-xs text-muted-foreground">{t("Packs pooled", locale)}</div>
              </div>
              <div>
                <div className="font-bold">{closed ? t("Closed", locale) : deadlineLabel(gb.deadline, locale)}</div>
                <div className="text-xs text-muted-foreground">{t("Deadline", locale)}</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {packSizeLabel(gb.pack_size, gb.product?.unit, locale)}
              {shops > 0 ? ` · ${tf(shops === 1 ? "{n} shop joined" : "{n} shops joined", { n: shops }, locale)}` : ""}
            </p>

            {progress.top > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("Price tiers", locale)}</span>
                  <span className="font-medium">
                    {tf("{pooled} / {top} for the best price", { pooled, top: progress.top }, locale)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {[...(gb.tiers ?? [])]
                    .sort((a, b) => a.min_packs - b.min_packs)
                    .map((tier) => (
                      <li key={tier.min_packs} className={pooled >= tier.min_packs ? "font-medium text-primary" : ""}>
                        {tf("{n}+ packs: {price} a pack", { n: tier.min_packs, price: rupees(tier.price) }, locale)}
                      </li>
                    ))}
                </ul>
                {progress.next && (
                  <p className="text-xs text-muted-foreground">
                    {tf(
                      progress.next.morePacks === 1
                        ? "{n} more pack to unlock {price} a pack"
                        : "{n} more packs to unlock {price} a pack",
                      { n: progress.next.morePacks, price: rupees(progress.next.price) },
                      locale,
                    )}
                    {saving > 0 ? ` ${tf("(saves {saving} a pack)", { saving: rupees(saving) }, locale)}` : ""}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">{t("Your commitment", locale)}</span>
              <span className="font-medium">{mine > 0 ? packsJoined(mine) : t("Not joined", locale)}</span>
            </div>
          </div>

          {closed ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("This group buy is closed, so it no longer takes packs.", locale)}
            </p>
          ) : (
            <div className="space-y-3">
              <label htmlFor="packs" className="text-sm font-medium">
                {t("Packs to commit", locale)}
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("Fewer packs", locale)}
                  onClick={() => setChosenPacks(clampPacks(packs - 1))}
                >
                  <Minus />
                </Button>
                <input
                  id="packs"
                  aria-label={t("Packs to commit", locale)}
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
                  aria-label={t("More packs", locale)}
                  onClick={() => setChosenPacks(clampPacks(packs + 1))}
                >
                  <Plus />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {tf(
                  "About {amount} at today's price. The final price is set when the deadline passes.",
                  { amount: rupees(packs * price) },
                  locale,
                )}
                {mine > 0 ? ` ${t("This replaces your earlier commitment.", locale)}` : ""}
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
                    {t("Joining…", locale)}
                  </>
                ) : mine > 0 ? (
                  <>
                    <CheckCircle />
                    {t("Update commitment", locale)}
                  </>
                ) : (
                  <>
                    <Users />
                    {t("Join group buy", locale)}
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
