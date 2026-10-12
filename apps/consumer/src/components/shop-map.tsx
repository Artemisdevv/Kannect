import { useEffect, useMemo, useRef } from "react";
import { textElement } from "@/lib/safe-dom";
import { type Coordinates, type MapShop, type StockStatus } from "@/lib/shopper";
import { t, useLocale } from "@/lib/i18n";
import "leaflet/dist/leaflet.css";

const colors: Record<StockStatus, string> = {
  in: "#18834b",
  low: "#d68a12",
  out: "#bc3a3a",
};

export function ShopMap({
  shops,
  selectedId,
  onSelect,
  origin,
}: {
  shops: MapShop[];
  /** Where the shopper is, when they shared it: drawn as a blue dot. */
  origin?: Coordinates | undefined;
  selectedId?: string | undefined;
  onSelect: (id: string) => void;
}) {
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const markers = useRef(new Map<string, import("leaflet").CircleMarker>());
  const positioned = useMemo(
    () => shops.filter((shop) => shop.coordinates !== null),
    [shops],
  );
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("leaflet").then((L) => {
      if (disposed || !container.current || positioned.length === 0) return;
      const leafletMap = L.map(container.current, {
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: true,
      });
      map.current = leafletMap;
      L.tileLayer(
        import.meta.env["VITE_MAP_TILE_URL"] ||
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      ).addTo(leafletMap);
      const layer = L.featureGroup().addTo(leafletMap);
      for (const shop of positioned) {
        if (!shop.coordinates) continue;
        const statusList = (shop.statuses ?? []).filter((status): status is StockStatus => status !== null);
        const uniqueStatuses = [...new Set(statusList)];
        const color =
          uniqueStatuses.length === 1 ? colors[uniqueStatuses[0]!] : "#52635a";
        const marker = L.circleMarker(
          [shop.coordinates.latitude, shop.coordinates.longitude],
          {
            radius: 9,
            color: "#fff",
            weight: 2,
            fillColor: color,
            fillOpacity: 1,
          },
        ).addTo(layer);
        // shop.name is typed by the shop owner: pass an element, never a string (Leaflet parses strings as HTML)
        marker.bindTooltip(textElement(shop.name), { direction: "top" });
        marker.on("click", () => selectRef.current(shop.id));
        markers.current.set(shop.id, marker);
      }
      const bounds = layer.getBounds();
      if (origin) {
        const here: [number, number] = [origin.latitude, origin.longitude];
        L.circleMarker(here, { radius: 18, weight: 0, fillColor: "#2563eb", fillOpacity: 0.18, interactive: false }).addTo(leafletMap);
        const you = L.circleMarker(here, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(leafletMap);
        you.bindTooltip(textElement(t("You are here", locale)), { direction: "top", permanent: true });
        bounds.extend(here);
      }
      leafletMap.fitBounds(bounds.pad(0.2), { maxZoom: 16 });
      cleanup = () => {
        markers.current.clear();
        leafletMap.remove();
        map.current = null;
      };
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positioned, origin?.latitude, origin?.longitude]);

  useEffect(() => {
    const marker = selectedId ? markers.current.get(selectedId) : undefined;
    if (marker) marker.openTooltip();
  }, [selectedId, positioned]);

  return (
    <div className="shop-map-wrap">
      {positioned.length > 0 && (
        <>
          <div
            ref={container}
            className="shop-map"
            role="region"
            aria-label={t('Map of nearby shops', locale)}
          />
          <div className="map-legend" aria-label={t('Availability marker key', locale)}>
            <span>
              <i className="in_stock" />
              {t('In stock', locale)}
            </span>
            <span>
              <i className="low" />
              {t('Low', locale)}
            </span>
            <span>
              <i className="out" />
              {t('Out', locale)}
            </span>
            {origin && (
              <span>
                <i className="you" />
                {t('You', locale)}
              </span>
            )}
            <span>
              <i className="mixed" />
              {t('Mixed or not applicable', locale)}
            </span>
          </div>
          <span className="sr-only">
            {positioned.length} {t('shops shown on map.', locale)}
          </span>
        </>
      )}
      {!positioned.length && (
        <p className="map-note">
          {t('No shops in these results have saved map coordinates. The accessible shop list is below.', locale)}
        </p>
      )}
    </div>
  );
}
