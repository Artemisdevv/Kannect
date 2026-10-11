import { Link } from "@tanstack/react-router";
import { AlertCircle, ChevronRight, Loader2, Truck, Users } from "lucide-react";

import type { GroupBuy } from "@/api";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { useOpenGroupBuys } from "@/features/queries";
import { rupees } from "@/lib/format";
import { t, tf, useLocale, type Locale } from "@/lib/i18n";
import { deadlineLabel, isClosed, packSizeLabel, productLabel, tierProgress } from "./helpers";

function Card({ gb, locale }: { gb: GroupBuy; locale: Locale }) {
  const pooled = gb.pooled_packs ?? 0;
  const mine = gb.my_packs ?? 0;
  const progress = tierProgress(gb.tiers, pooled);

  return (
    <article className="list-surface space-y-3 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{productLabel(gb.product, locale)}</h3>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="h-3.5 w-3.5" />
            {gb.supplier?.name ?? t("Supplier", locale)}
          </p>
          <p className="text-xs text-muted-foreground">{packSizeLabel(gb.pack_size, gb.product?.unit, locale)}</p>
        </div>
        {mine > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Users className="h-3 w-3" />
            {tf(mine === 1 ? "Joined {n} pack" : "Joined {n} packs", { n: mine }, locale)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div>
          <div className="text-2xl font-bold">{rupees(gb.current_price ?? 0)}</div>
          <div className="text-xs text-muted-foreground">{t("a pack now", locale)}</div>
        </div>
        <div>
          <div className="font-bold">{pooled}</div>
          <div className="text-xs text-muted-foreground">{t("Packs pooled", locale)}</div>
        </div>
        <div>
          <div className="font-bold">{deadlineLabel(gb.deadline, locale)}</div>
          <div className="text-xs text-muted-foreground">{t("Deadline", locale)}</div>
        </div>
      </div>

      {progress.top > 0 && (
        <div className="space-y-1 border-t pt-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          {progress.next && (
            <p className="text-xs text-muted-foreground">
              {tf(
                progress.next.morePacks === 1
                  ? "{n} more pack to unlock {price} a pack"
                  : "{n} more packs to unlock {price} a pack",
                { n: progress.next.morePacks, price: rupees(progress.next.price) },
                locale,
              )}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button variant="outline" asChild>
          <Link to="/group-buys/$id" params={{ id: gb.id ?? "" }}>
            <span className="flex items-center gap-2">
              {t("View details", locale)} <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function GroupBuysPage() {
  const locale = useLocale();
  const buys = useOpenGroupBuys();

  if (buys.isLoading) {
    return (
      <Shell active="More">
        <div className="app-main">
          <div className="empty-state" role="status">
            <Loader2 className="animate-spin" />
            <h2>{t("Loading group buys…", locale)}</h2>
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
            <h2>{t("Could not load group buys", locale)}</h2>
            <p>{buys.error instanceof Error ? buys.error.message : t("Please try again.", locale)}</p>
            <Button variant="outline" onClick={() => void buys.refetch()}>
              {t("Try again", locale)}
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
        <div className="eyebrow">{t("Procurement", locale)}</div>
        <h1 className="mt-2">{t("Group buys", locale)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Join other shops to unlock lower wholesale prices.", locale)}
        </p>

        {joined.length > 0 && (
          <section className="mt-6">
            <div className="section-heading">
              <h2>{t("You joined", locale)}</h2>
            </div>
            <div className="space-y-3">
              {joined.map((gb) => (
                <Card key={gb.id} gb={gb} locale={locale} />
              ))}
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section className="mt-6">
            <div className="section-heading">
              <h2>{t("Available", locale)}</h2>
            </div>
            <div className="space-y-3">
              {others.map((gb) => (
                <Card key={gb.id} gb={gb} locale={locale} />
              ))}
            </div>
          </section>
        )}

        {open.length === 0 && (
          <div className="empty-state mt-12">
            <Users />
            <h2>{t("No open group buys", locale)}</h2>
            <p>{t("Check back later. Suppliers near you post new deals regularly.", locale)}</p>
          </div>
        )}
      </div>
    </Shell>
  );
}
