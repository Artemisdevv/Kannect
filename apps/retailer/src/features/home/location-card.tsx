import { useState } from "react";
import { LocateFixed, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { ApiError, updateShop } from "@/api";
import { useShop } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { getCurrentPoint, LocationError, locationMessage } from "@/lib/location";
import { t, useLocale } from "@/lib/i18n";

/**
 * Where the shop is on the map. Shoppers find the shop, and suppliers deliver to it, by this
 * point, so it can be set again at any time: stand in the shop and tap the button.
 */
export function LocationCard({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const shop = useShop();
  const [busy, setBusy] = useState(false);
  const saved = shop?.location;

  const update = async () => {
    setBusy(true);
    try {
      const { lat, lng, accuracy } = await getCurrentPoint();
      await updateShop({ location: { lat, lng } });
      toast.success(
        accuracy > 500
          ? t("Location saved, but it is rough. Try again outdoors for a better spot.", locale)
          : t("Shop location updated", locale),
      );
    } catch (e) {
      if (e instanceof LocationError) toast.error(t(locationMessage(e.reason), locale));
      else toast.error(e instanceof ApiError ? e.message : t("Could not save your location. Try again.", locale));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={["list-surface p-4 space-y-3", className].join(" ")}>
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold">{saved ? t("Shop location", locale) : t("Your shop is not on the map yet", locale)}</p>
          <p className="text-muted-foreground">
            {saved
              ? `${saved.lat?.toFixed(5)}, ${saved.lng?.toFixed(5)}`
              : t("Shoppers and suppliers cannot find your shop until you save its location.", locale)}
          </p>
        </div>
      </div>
      <Button variant={saved ? "outline" : "default"} className="w-full" disabled={busy} onClick={() => void update()}>
        {busy ? <Loader2 className="animate-spin" /> : <LocateFixed />}
        {busy
          ? t("Finding your location…", locale)
          : saved
            ? t("Update to my current location", locale)
            : t("Save my shop location", locale)}
      </Button>
      {!saved && <p className="text-xs text-muted-foreground">{t("Stand inside your shop when you tap this.", locale)}</p>}
    </div>
  );
}
