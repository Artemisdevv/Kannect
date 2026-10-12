import { Link } from "@tanstack/react-router";
import { Bell, Ellipsis, House, Package, ReceiptText, Truck } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import { getShop, subscribe } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePickups, useShopProducts } from "@/features/queries";
import { t, tf, useLocale } from "@/lib/i18n";
import { LanguageSwitcher } from "./language-switcher";

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

const BRAND = "Kannect"; // the name is the logo's alt text, not a translated string

export function useShop() {
  return useSyncExternalStore(subscribe, getShop, () => null);
}

export function Shell({ children, active }: { children: ReactNode; active: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const shop = useShop();
  const products = useShopProducts();
  const newPickups = (usePickups().data ?? []).filter((r) => r.status === "requested").length;
  const needAttention = (products.data ?? []).filter(
    (p) => p.stock_status === "low" || p.stock_status === "out",
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand min-w-0" aria-label={BRAND}>
          <img src="/kannect-logo.png" alt={BRAND} className="brand-logo" />
          <span className="brand-caption">{t("Retailer", locale)}</span>
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("Notifications", locale)}
            className="relative"
            onClick={() => setOpen(true)}
          >
            <Bell size={21} />
            {(needAttention.length > 0 || newPickups > 0) && (
              <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-destructive" />
            )}
          </Button>
        </div>
      </header>
      <main className="app-main">
        {children}
        {shop?.name && <div className="demo-footer">{shop.name}</div>}
      </main>
      <nav className="bottom-nav" aria-label={t("Main navigation", locale)}>
        {nav.map((n) => (
          <Link
            key={n.label}
            to={n.to}
            className={`nav-item ${active === n.label ? "active" : ""}`}
            aria-current={active === n.label ? "page" : undefined}
          >
            <n.icon />
            <span>{t(n.label, locale)}</span>
          </Link>
        ))}
      </nav>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>{t("Shop updates", locale)}</DialogTitle>
          <DialogDescription>{t("Based on your current stock", locale)}</DialogDescription>
          {newPickups > 0 && (
            <p className="text-sm">
              <Link to="/pickups" className="underline" onClick={() => setOpen(false)}>
                {tf(newPickups === 1 ? "{n} pickup request waiting" : "{n} pickup requests waiting", { n: newPickups }, locale)}
              </Link>
            </p>
          )}
          {needAttention.length === 0 ? (
            <p className="text-sm">{t("Nothing needs restocking right now.", locale)}</p>
          ) : (
            <p className="text-sm">
              {tf(
                needAttention.length === 1
                  ? "{n} product low or out of stock. Open Orders for reorder suggestions."
                  : "{n} products low or out of stock. Open Orders for reorder suggestions.",
                { n: needAttention.length },
                locale,
              )}
            </p>
          )}
          <Button onClick={() => setOpen(false)}>{t("Got it", locale)}</Button>
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
