import { useEffect, useMemo, useRef } from "react";
import { textElement } from "@/lib/safe-dom";
import { type MapShop, type StockStatus } from "@/lib/shopper";
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
}: {
  shops: MapShop[];
  selectedId?: string | undefined;
  onSelect: (id: string) => void;
}) {
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
      leafletMap.fitBounds(layer.getBounds().pad(0.2), { maxZoom: 14 });
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
  }, [positioned]);

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
            aria-label="Map of nearby shops"
          />
          <div className="map-legend" aria-label="Availability marker key">
            <span>
              <i className="in_stock" />
              In stock
            </span>
            <span>
              <i className="low" />
              Low
            </span>
            <span>
              <i className="out" />
              Out
            </span>
            <span>
              <i className="mixed" />
              Mixed or not applicable
            </span>
          </div>
          <span className="sr-only">
            {positioned.length} shops shown on map.
          </span>
        </>
      )}
      {!positioned.length && (
        <p className="map-note">
          No shops in these results have saved map coordinates. The accessible
          shop list is below.
        </p>
      )}
    </div>
  );
}
