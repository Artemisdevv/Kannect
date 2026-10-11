import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Camera, ChevronRight, HandHelping, Package, ReceiptText, ScanLine, Truck } from "lucide-react";

import { Heading, Shell, useShop } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { useBills, useOrders, usePickups, useShopProducts } from "@/features/queries";
import { formatQty, rupees, STATUS_LABEL, statusClass } from "@/lib/format";
import { t, useLocale } from "@/lib/i18n";

const isToday = (iso?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
};

export function TodayPage() {
  const locale = useLocale();
  const shop = useShop();
  const products = useShopProducts();
  const bills = useBills();
  const orders = useOrders();
  const pickups = usePickups();
  const newPickups = (pickups.data ?? []).filter((r) => r.status === "requested");
  const heldPickups = (pickups.data ?? []).filter((r) => r.status === "accepted");

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
      <h1>{shop?.name ?? t("Your shop", locale)}</h1>
      {shop?.address && <p className="eyebrow">{shop.address}</p>}

      {empty && (
        <div className="list-surface p-5 mt-4 space-y-3">
          <p className="text-sm">{t("Your shop has no products yet. The quickest start is a photo of your shelves.", locale)}</p>
          <Button asChild>
            <Link to="/onboard"><Camera /> {t("Set up from a photo", locale)}</Link>
          </Button>
        </div>
      )}

      {(newPickups.length > 0 || heldPickups.length > 0) && (
        <Link to="/pickups" className="list-surface order-preview mt-4" style={{ background: "var(--accent)" }}>
          <div className="brand-mark bg-secondary text-primary"><HandHelping size={22} /></div>
          <div className="min-w-0">
            <div className="product-name">
              {newPickups.length > 0 ? `${newPickups.length} ${t(newPickups.length === 1 ? "pickup request" : "pickup requests", locale)} ${t("waiting", locale)}` : t("Items held for pickup", locale)}
            </div>
            <div className="product-sub">
              {newPickups.length > 0 ? t("Shoppers want you to set items aside", locale) : `${heldPickups.length} ${t("held for a shopper", locale)}`}
              {newPickups.length > 0 && heldPickups.length > 0 ? ` · ${heldPickups.length} held` : ""}
            </div>
          </div>
          <ChevronRight />
        </Link>
      )}

      <div className="summary-grid">
        <div className="summary">
          <div className="summary-top">{t("Today's sales", locale)}<ArrowUpRight size={17} /></div>
          <div className="summary-value">{rupees(sales)}</div>
          <div className="summary-note">{todays.length} {t(todays.length === 1 ? "bill" : "bills", locale)} {t("today", locale)}</div>
        </div>
        <div className="summary">
          <div className="summary-top">{t("Needs attention", locale)}<Package size={17} /></div>
          <div className="summary-value">
            {attention.length} <span className="text-sm font-normal text-muted-foreground">{t("items", locale)}</span>
          </div>
          <div className="summary-note">{low} low stock · {out} out of stock</div>
        </div>
      </div>

      <div className="action-grid">
        <Button asChild className="action-tile">
          <Link to="/billing"><ReceiptText />{t("Create bill", locale)}</Link>
        </Button>
        <Button asChild variant="outline" className="action-tile">
          <Link to="/stock"><ScanLine />{t("Update stock", locale)}</Link>
        </Button>
      </div>

      {attention.length > 0 && (
        <>
          <Heading title={t("Time to restock", locale)}>
            <Button variant="link" asChild>
              <Link to="/stock">{t("View all", locale)} <ChevronRight /></Link>
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
              <Link to="/orders">{t("Review reorder suggestions", locale)} <ChevronRight /></Link>
            </Button>
          </div>
        </>
      )}

      {open && (
        <>
          <Heading title={t("Your orders", locale)} />
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
