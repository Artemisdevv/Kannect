import { Link, useNavigate } from "@tanstack/react-router";
import { Camera, ChevronRight, ClipboardCheck, Download, HandHelping, Loader2, LogOut, Users } from "lucide-react";

import { LocationCard } from "@/features/home/location-card";
import { useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { toast } from "sonner";

import { exportShopCsv, signOut } from "@/api";
import { Shell, useShop } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { shopTypeLabel } from "@/lib/format";
import { saveFile } from "@/lib/save-file";
import { t, useLocale } from "@/lib/i18n";

export function MorePage() {
  const locale = useLocale();
  const shop = useShop();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    setExporting(true);
    try {
      const csv = await exportShopCsv();
      await saveFile(`kannect-${new Date().toISOString().slice(0, 10)}.csv`, csv, t("Kannect shop data", locale));
      toast.success(t("Your data is ready", locale));
    } catch {
      toast.error(t("Could not export your data. Try again.", locale));
    } finally {
      setExporting(false);
    }
  };

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
        <Button variant="ghost" className="w-full justify-between rounded-none h-16 px-4" disabled={exporting} onClick={() => void exportData()}>
          <span className="flex items-center gap-3">
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            <span className="text-left">
              {exporting ? t("Preparing your file…", locale) : t("Export my data", locale)}
              <span className="block text-xs text-muted-foreground font-normal">{t("Download your sales and stock as a spreadsheet", locale)}</span>
            </span>
          </span>
        </Button>
      </div>

      <LocationCard className="mt-4" />

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
