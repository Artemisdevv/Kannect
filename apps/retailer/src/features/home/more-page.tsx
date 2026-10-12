import { Link, useNavigate } from "@tanstack/react-router";
import { Camera, ChevronRight, ClipboardCheck, HandHelping, LogOut, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { signOut } from "@/api";
import { Shell, useShop } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { shopTypeLabel } from "@/lib/format";
import { t, useLocale } from "@/lib/i18n";

export function MorePage() {
  const locale = useLocale();
  const shop = useShop();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const logout = async () => {
    signOut();
    qc.clear(); // never show the next person at this phone the previous shop's data
    await navigate({ to: "/login" });
  };

  const items = [
    { to: "/pickups" as const, icon: HandHelping, label: t("Pickup requests", locale), sub: t("Shoppers asking you to set items aside", locale) },
    { to: "/onboard" as const, icon: Camera, label: t("Set up from a shelf photo", locale), sub: t("Add many products at once", locale) },
    { to: "/stock" as const, icon: ClipboardCheck, label: t("Weekly recount", locale), sub: t("Check and update your counts", locale) },
    { to: "/group-buys" as const, icon: Users, label: t("Group buys", locale), sub: t("Join supplier deals with other shops", locale) },
  ];

  return (
    <Shell active="More">
      <p className="eyebrow">{shop?.name}</p>
      <h1>{t("More", locale)}</h1>

      <div className="list-surface mt-4">
        {items.map((item) => (
          <Button key={item.label} variant="ghost" className="w-full justify-between border-b rounded-none h-16 px-4" asChild>
            <Link to={item.to}>
              <span className="flex items-center gap-3">
                <item.icon />
                <span className="text-left">
                  {item.label}
                  <span className="block text-xs text-muted-foreground font-normal">{item.sub}</span>
                </span>
              </span>
              <ChevronRight />
            </Link>
          </Button>
        ))}
      </div>

      <div className="list-surface mt-4 p-4 text-sm space-y-1">
        <p className="font-semibold">{shop?.name}</p>
        {shop?.address && <p className="text-muted-foreground">{shop.address}</p>}
        {shop?.shop_type && <p className="text-muted-foreground">{shopTypeLabel(shop.shop_type, locale)}</p>}
      </div>

      <Button variant="outline" className="w-full mt-4" onClick={() => void logout()}>
        <LogOut /> {t("Sign out", locale)}
      </Button>
    </Shell>
  );
}
