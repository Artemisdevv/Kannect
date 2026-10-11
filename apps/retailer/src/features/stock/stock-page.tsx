import { ChevronRight, Package, ScanLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, type ShopProduct } from "@/api";
import { Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useRecount, useShopProducts } from "@/features/queries";
import { ScanDialog } from "@/features/scan/scan-dialog";
import { formatQty, newId, priceLabel, STATUS_LABEL, statusClass } from "@/lib/format";

const FILTERS = ["All", "Low", "Out", "Review"] as const;
type Filter = (typeof FILTERS)[number];

export function StockPage() {
  const products = useShopProducts();
  const recount = useRecount();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [selected, setSelected] = useState<ShopProduct | null>(null);
  const [quantity, setQuantity] = useState("");
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
    const perKg = row.product?.unit === "gram";
    setSelected(row);
    setQuantity(row.needs_recount ? "" : String((row.stock_qty ?? 0) / (perKg ? 1000 : 1)));
    setCountId(newId());
  };

  const perKg = selected?.product?.unit === "gram";
  const parsed = Number(quantity);
  const valid = quantity !== "" && Number.isFinite(parsed) && parsed >= 0;

  const confirm = async () => {
    if (!selected?.product?.id || !valid) return;
    try {
      await recount.mutateAsync({
        items: [
          {
            client_id: countId,
            product_id: selected.product.id,
            quantity: Math.round(parsed * (perKg ? 1000 : 1)),
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
          <DialogDescription>Count what is on the shelf, then confirm.</DialogDescription>
          <label className="text-sm" htmlFor="stock-count">
            {perKg ? "Kilograms in stock" : "Quantity in stock"}
          </label>
          <input
            id="stock-count"
            className="page-search"
            type="number"
            min="0"
            step={perKg ? "0.25" : "1"}
            inputMode="decimal"
            placeholder="Enter the count"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Button disabled={!valid || recount.isPending} onClick={() => void confirm()}>
            {recount.isPending ? "Saving…" : "Confirm count"}
          </Button>
        </DialogContent>
      </Dialog>

      <ScanDialog open={scan} onOpenChange={setScan} title="Scan to count" onProduct={open} />
    </Shell>
  );
}
