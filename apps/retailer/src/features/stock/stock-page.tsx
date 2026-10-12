import { ChevronRight, Minus, Package, Plus, ScanLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, type ShopProduct } from "@/api";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useRecount, useShopProducts } from "@/features/queries";
import { ScanDialog } from "@/features/scan/scan-dialog";
import { formatQty, newId, priceLabel, STATUS_LABEL, statusClass, stepFor } from "@/lib/format";
import { t, tf, useLocale } from "@/lib/i18n";

const FILTERS = ["All", "Low", "Out", "Review"] as const;
type Filter = (typeof FILTERS)[number];

export function StockPage() {
  const locale = useLocale();
  const products = useShopProducts();
  const recount = useRecount();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [selected, setSelected] = useState<ShopProduct | null>(null);
  // The count being edited, in base units (pieces, or grams for loose goods).
  const [count, setCount] = useState(0);
  const [scan, setScan] = useState(false);
  // One id per count: pressing Confirm twice (or retrying) cannot apply it twice.
  const [countId, setCountId] = useState(newId());

  const rows = (products.data ?? []).filter((p) => {
    const q = search.trim().toLowerCase();
    const text = `${p.product?.name ?? ""} ${p.product?.brand ?? ""}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (filter === "Low") return p.stock_status === "low";
    if (filter === "Out") return p.stock_status === "out";
    if (filter === "Review") return Boolean(p.needs_recount);
    return true;
  });

  const open = (row: ShopProduct) => {
    setSelected(row);
    setCount(Math.max(0, row.stock_qty ?? 0)); // start from what the system says is on the shelf
    setCountId(newId());
  };

  const unit = selected?.product?.unit;
  const step = stepFor(unit);
  const current = Math.max(0, selected?.stock_qty ?? 0);
  const unknown = Boolean(selected?.needs_recount);
  const delta = count - current;
  const change = (by: number) => setCount((c) => Math.max(0, c + by));

  const confirm = async () => {
    if (!selected?.product?.id) return;
    try {
      await recount.mutateAsync({
        items: [
          {
            client_id: countId,
            product_id: selected.product.id,
            quantity: count,
            count_source: "owner_exact",
          },
        ],
      });
      toast.success(t("Stock updated", locale));
      setSelected(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("Could not update the stock.", locale));
    }
  };

  return (
    <Shell active="Stock">
      <p className="eyebrow">{t("Your shop", locale)}</p>
      <h1>{t("Stock", locale)}</h1>
      <p className="eyebrow">{tf("{n} products · Keep your shelves ready", { n: products.data?.length ?? 0 }, locale)}</p>

      <div className="flex gap-2 mt-3">
        <input
          className="page-search min-w-0"
          aria-label={t("Search stock", locale)}
          placeholder={t("Search your stock…", locale)}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button size="icon" aria-label={t("Scan to count", locale)} onClick={() => setScan(true)}>
          <ScanLine />
        </Button>
      </div>
      <div className="filter-row">
        {FILTERS.map((f) => (
          <Button key={f} variant={filter === f ? "secondary" : "ghost"} onClick={() => setFilter(f)}>
            {t(f, locale)}
          </Button>
        ))}
      </div>

      {products.isLoading && <p className="text-center text-muted-foreground py-8">{t("Loading…", locale)}</p>}
      {products.isError && <p className="text-center text-destructive py-8">{t("Could not load your stock.", locale)}</p>}

      <div className="list-surface">
        {rows.map((row) => (
          <div key={row.product?.id} className="product-row">
            <div className="product-art text-primary" aria-hidden="true">
              <Package size={25} />
            </div>
            <div className="min-w-0">
              <div className="product-name">{row.product?.name}</div>
              <div className="product-sub">
                {row.needs_recount ? t("Count needed", locale) : formatQty(row.stock_qty, row.product?.unit)}
                {row.product?.unit === "gram" ? "" : row.needs_recount ? "" : t(" left", locale)}
              </div>
            </div>
            <Button variant="ghost" onClick={() => open(row)} aria-label={`Count ${row.product?.name}`}>
              <span className="flex flex-col items-end gap-1">
                <span className={`status-pill ${statusClass(row.needs_recount ? "low" : row.stock_status)}`}>
                  {row.needs_recount ? t("Review", locale) : t(STATUS_LABEL[row.stock_status ?? "in_stock"] ?? "", locale)}
                </span>
                <span className="text-xs">{priceLabel(row.price, row.product?.unit)}</span>
              </span>
              <ChevronRight />
            </Button>
          </div>
        ))}
      </div>
      {products.data && rows.length === 0 && (
        <p className="text-center text-muted-foreground py-8">{t("No products in this view.", locale)}</p>
      )}
      <p className="text-xs text-muted-foreground mt-3">
        {t("A count you enter is exact. Unknown quantities stay unknown until you count them.", locale)}
      </p>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>{selected?.product?.name}</DialogTitle>
          <DialogDescription>
            {unknown
              ? t("We don't know how many you have yet. Count the shelf and set the number.", locale)
              : `${t("In stock now: ", locale)}${formatQty(current, unit)}${unit === "gram" ? "" : " "}${t("Adjust if the shelf is different.", locale)}`}
          </DialogDescription>

          <div className="flex items-center justify-between gap-3 py-2">
            <Button variant="outline" size="icon" className="size-14 rounded-full" aria-label={t("Decrease", locale)} disabled={count <= 0} onClick={() => change(-step)}>
              <Minus />
            </Button>
            <div className="text-center">
              <div className="text-4xl font-bold tabular-nums">{formatQty(count, unit)}</div>
              {!unknown && delta !== 0 && (
                <div className="text-xs text-muted-foreground">
                  {tf("{change} from {current}", { change: `${delta > 0 ? "+" : "−"}${formatQty(Math.abs(delta), unit)}`, current: formatQty(current, unit) }, locale)}
                </div>
              )}
            </div>
            <Button variant="outline" size="icon" className="size-14 rounded-full" aria-label={t("Increase", locale)} onClick={() => change(step)}>
              <Plus />
            </Button>
          </div>

          <div className="flex gap-2 justify-center">
            {(unit === "gram" ? [1000, 5000] : [5, 10]).map((n) => (
              <Button key={n} variant="ghost" size="sm" onClick={() => change(n)}>
                +{formatQty(n, unit)}
              </Button>
            ))}
            <Button variant="ghost" size="sm" disabled={count === 0} onClick={() => setCount(0)}>
              {t("Zero", locale)}
            </Button>
          </div>

          <Button disabled={recount.isPending} onClick={() => void confirm()}>
            {recount.isPending ? t("Saving…", locale) : unknown ? t("Save count", locale) : delta === 0 ? t("Count is right", locale) : t("Update stock", locale)}
          </Button>
        </DialogContent>
      </Dialog>

      <ScanDialog open={scan} onOpenChange={setScan} title={t("Scan to count", locale)} onProduct={open} />
    </Shell>
  );
}
