import { Link } from "@tanstack/react-router";
import { Bell, Ellipsis, House, Package, ReceiptText, Store, Truck } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import { getShop, subscribe } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useShopProducts } from "@/features/queries";

export function pageHead(title: string, description: string) {
  const full = `${title} · Kannect Retailer`;
  return {
    meta: [
      { title: full },
      { name: "description", content: description },
      { property: "og:title", content: full },
      { property: "og:description", content: description },
    ],
  };
}

const nav = [
  { to: "/" as const, label: "Today", icon: House },
  { to: "/billing" as const, label: "Billing", icon: ReceiptText },
  { to: "/stock" as const, label: "Stock", icon: Package },
  { to: "/orders" as const, label: "Orders", icon: Truck },
  { to: "/more" as const, label: "More", icon: Ellipsis },
];

export function useShop() {
  return useSyncExternalStore(subscribe, getShop, () => null);
}

export function Shell({ children, active }: { children: ReactNode; active: string }) {
  const [open, setOpen] = useState(false);
  const shop = useShop();
  const products = useShopProducts();
  const needAttention = (products.data ?? []).filter(
    (p) => p.stock_status === "low" || p.stock_status === "out",
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand min-w-0">
          <span className="brand-mark shrink-0">
            <Store size={23} />
          </span>
          <div>
            Kannect
            <div className="brand-caption">Retailer</div>
          </div>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className="relative"
          onClick={() => setOpen(true)}
        >
          <Bell size={21} />
          {needAttention.length > 0 && (
            <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-destructive" />
          )}
        </Button>
      </header>
      <main className="app-main">
        {children}
        {shop?.name && <div className="demo-footer">{shop.name}</div>}
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {nav.map((n) => (
          <Link
            key={n.label}
            to={n.to}
            className={`nav-item ${active === n.label ? "active" : ""}`}
            aria-current={active === n.label ? "page" : undefined}
          >
            <n.icon />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>Shop updates</DialogTitle>
          <DialogDescription>Based on your current stock</DialogDescription>
          {needAttention.length === 0 ? (
            <p className="text-sm">Nothing needs restocking right now.</p>
          ) : (
            <p className="text-sm">
              {needAttention.length} product{needAttention.length === 1 ? "" : "s"} low or out of
              stock. Open Orders for reorder suggestions.
            </p>
          )}
          <Button onClick={() => setOpen(false)}>Got it</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Heading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
