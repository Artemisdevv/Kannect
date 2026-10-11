import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Camera, ChevronRight, Package, ReceiptText, ScanLine, Truck } from "lucide-react";

import { Heading, Shell, useShop } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { useBills, useOrders, useShopProducts } from "@/features/queries";
import { formatQty, rupees, STATUS_LABEL, statusClass } from "@/lib/format";

const isToday = (iso?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
};

export function TodayPage() {
  const shop = useShop();
  const products = useShopProducts();
  const bills = useBills();
  const orders = useOrders();

  const todays = (bills.data ?? []).filter((b) => isToday(b.created_at));
  const sales = todays.reduce((sum, b) => sum + (b.total ?? 0), 0);
  const attention = (products.data ?? []).filter((p) => p.stock_status === "low" || p.stock_status === "out");
  const low = attention.filter((p) => p.stock_status === "low").length;
  const out = attention.length - low;
  const open = (orders.data ?? []).find((o) => o.status !== "cancelled" && o.status !== "rejected");
  const empty = products.data && products.data.length === 0;

  return (
    <Shell active="Today">
      <p className="eyebrow">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1>{shop?.name ?? "Your shop"}</h1>
      {shop?.address && <p className="eyebrow">{shop.address}</p>}

      {empty && (
        <div className="list-surface p-5 mt-4 space-y-3">
          <p className="text-sm">Your shop has no products yet. The quickest start is a photo of your shelves.</p>
          <Button asChild>
            <Link to="/onboard"><Camera /> Set up from a photo</Link>
          </Button>
        </div>
      )}

      <div className="summary-grid">
        <div className="summary">
          <div className="summary-top">Today's sales<ArrowUpRight size={17} /></div>
          <div className="summary-value">{rupees(sales)}</div>
          <div className="summary-note">{todays.length} bill{todays.length === 1 ? "" : "s"} today</div>
        </div>
        <div className="summary">
          <div className="summary-top">Needs attention<Package size={17} /></div>
          <div className="summary-value">
            {attention.length} <span className="text-sm font-normal text-muted-foreground">items</span>
          </div>
          <div className="summary-note">{low} low stock · {out} out of stock</div>
        </div>
      </div>

      <div className="action-grid">
        <Button asChild className="action-tile">
          <Link to="/billing"><ReceiptText />Create bill</Link>
        </Button>
        <Button asChild variant="outline" className="action-tile">
          <Link to="/stock"><ScanLine />Update stock</Link>
        </Button>
      </div>

      {attention.length > 0 && (
        <>
          <Heading title="Time to restock">
            <Button variant="link" asChild>
              <Link to="/stock">View all <ChevronRight /></Link>
            </Button>
          </Heading>
          <div className="list-surface">
            {attention.slice(0, 4).map((p) => (
              <div key={p.product?.id} className="product-row">
                <div className="product-art text-primary" aria-hidden="true"><Package size={25} /></div>
                <div className="min-w-0">
                  <div className="product-name">{p.product?.name}</div>
                  <div className="product-sub">{formatQty(p.stock_qty, p.product?.unit)}{p.product?.unit === "gram" ? "" : " left"}</div>
                </div>
                <span className={`status-pill ${statusClass(p.stock_status)}`}>{STATUS_LABEL[p.stock_status ?? "low"]}</span>
              </div>
            ))}
            <Button variant="ghost" className="w-full text-primary" asChild>
              <Link to="/orders">Review reorder suggestions <ChevronRight /></Link>
            </Button>
          </div>
        </>
      )}

      {open && (
        <>
          <Heading title="Your orders" />
          <Link to="/orders" className="list-surface order-preview">
            <div className="brand-mark bg-secondary text-primary"><Truck size={22} /></div>
            <div className="min-w-0">
              <div className="product-name">{open.supplier?.name}</div>
              <div className="product-sub">{open.items?.length ?? 0} item{(open.items?.length ?? 0) === 1 ? "" : "s"} · {rupees(open.total)}</div>
            </div>
            <span className="status-pill">{open.status}</span>
          </Link>
        </>
      )}
    </Shell>
  );
}
