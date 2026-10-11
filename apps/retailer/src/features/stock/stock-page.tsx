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

const FILTERS = ["All", "Low", "Out", "Review"] as const;
type Filter = (typeof FILTERS)[number];

export function StockPage() {
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
      toast.success("Stock updated");
      setSelected(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update the stock.");
    }
  };

  return (
    <Shell active="Stock">
      <p className="eyebrow">Your shop</p>
      <h1>Stock</h1>
      <p className="eyebrow">{products.data?.length ?? 0} products · Keep your shelves ready</p>

      <div className="flex gap-2 mt-3">
        <input
          className="page-search min-w-0"
          aria-label="Search stock"
          placeholder="Search your stock…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button size="icon" aria-label="Scan to count" onClick={() => setScan(true)}>
          <ScanLine />
        </Button>
      </div>
      <div className="filter-row">
        {FILTERS.map((f) => (
          <Button key={f} variant={filter === f ? "secondary" : "ghost"} onClick={() => setFilter(f)}>
            {f}
          </Button>
        ))}
      </div>

      {products.isLoading && <p className="text-center text-muted-foreground py-8">Loading…</p>}
      {products.isError && <p className="text-center text-destructive py-8">Could not load your stock.</p>}

      <div className="list-surface">
        {rows.map((row) => (
          <div key={row.product?.id} className="product-row">
            <div className="product-art text-primary" aria-hidden="true">
              <Package size={25} />
            </div>
            <div className="min-w-0">
              <div className="product-name">{row.product?.name}</div>
              <div className="product-sub">
                {row.needs_recount ? "Count needed" : formatQty(row.stock_qty, row.product?.unit)}
                {row.product?.unit === "gram" ? "" : row.needs_recount ? "" : " left"}
              </div>
            </div>
            <Button variant="ghost" onClick={() => open(row)} aria-label={`Count ${row.product?.name}`}>
              <span className="flex flex-col items-end gap-1">
                <span className={`status-pill ${statusClass(row.needs_recount ? "low" : row.stock_status)}`}>
                  {row.needs_recount ? "Review" : STATUS_LABEL[row.stock_status ?? "in_stock"]}
                </span>
                <span className="text-xs">{priceLabel(row.price, row.product?.unit)}</span>
              </span>
              <ChevronRight />
            </Button>
          </div>
        ))}
      </div>
      {products.data && rows.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No products in this view.</p>
      )}
      <p className="text-xs text-muted-foreground mt-3">
        A count you enter is exact. Unknown quantities stay unknown until you count them.
      </p>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>{selected?.product?.name}</DialogTitle>
          <DialogDescription>
            {unknown
              ? "We don't know how many you have yet. Count the shelf and set the number."
              : `In stock now: ${formatQty(current, unit)}${unit === "gram" ? "" : " "}. Adjust if the shelf is different.`}
          </DialogDescription>

          <div className="flex items-center justify-between gap-3 py-2">
            <Button variant="outline" size="icon" className="size-14 rounded-full" aria-label="Decrease" disabled={count <= 0} onClick={() => change(-step)}>
              <Minus />
            </Button>
            <div className="text-center">
              <div className="text-4xl font-bold tabular-nums">{formatQty(count, unit)}</div>
              {!unknown && delta !== 0 && (
                <div className="text-xs text-muted-foreground">
                  {delta > 0 ? "+" : "−"}
                  {formatQty(Math.abs(delta), unit)} from {formatQty(current, unit)}
                </div>
              )}
            </div>
            <Button variant="outline" size="icon" className="size-14 rounded-full" aria-label="Increase" onClick={() => change(step)}>
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
              Zero
            </Button>
          </div>

          <Button disabled={recount.isPending} onClick={() => void confirm()}>
            {recount.isPending ? "Saving…" : unknown ? "Save count" : delta === 0 ? "Count is right" : "Update stock"}
          </Button>
        </DialogContent>
      </Dialog>

      <ScanDialog open={scan} onOpenChange={setScan} title="Scan to count" onProduct={open} />
    </Shell>
  );
}
