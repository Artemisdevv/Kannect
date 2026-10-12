import { useEffect, useRef, useState } from "react";
import { t, tf, useLocale } from "@/lib/i18n";
import { textElement } from "@/lib/safe-dom";
import "leaflet/dist/leaflet.css";

// The API may send a place with no coordinates (null), so accept that and check it before use.
type Location = { lat: number | null; lng: number | null };
type Point = { lat: number; lng: number };

export type RouteEndpoint = {
  label: string;
  location: Location | null | undefined;
};

function validLocation(location: Location | null | undefined): location is Point {
  return (
    location !== undefined &&
    location !== null &&
    location.lat !== null &&
    location.lng !== null &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    location.lat >= -90 &&
    location.lat <= 90 &&
    location.lng >= -180 &&
    location.lng <= 180
  );
}

export function OrderRouteMap({ supplier, shop }: { supplier: RouteEndpoint; shop: RouteEndpoint }) {
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);
  const [mapError, setMapError] = useState(false);
  const supplierLocation = validLocation(supplier.location) ? supplier.location : null;
  const shopLocation = validLocation(shop.location) ? shop.location : null;

  useEffect(() => {
    if (!supplierLocation || !shopLocation || !container.current) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void import("leaflet").then((L) => {
      if (disposed || !container.current) return;
      setMapError(false);
      const map = L.map(container.current, { scrollWheelZoom: false });
      const supplierPoint: [number, number] = [supplierLocation.lat, supplierLocation.lng];
      const shopPoint: [number, number] = [shopLocation.lat, shopLocation.lng];
      // Leaflet draws markers and lines against the map's view: without one it throws while adding
      // them ("reading 'intersects'") and the map never shows. fitBounds below sets the final view.
      map.setView(supplierPoint, 13);
      const endpoints = L.featureGroup().addTo(map);
      L.circleMarker(supplierPoint, {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#633b13",
        fillOpacity: 1,
      })
        .bindTooltip(textElement(supplier.label))
        .addTo(endpoints);
      L.circleMarker(shopPoint, {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#18834b",
        fillOpacity: 1,
      })
        .bindTooltip(textElement(shop.label))
        .addTo(endpoints);

      const route = L.polyline([supplierPoint, shopPoint], {
        color: "#87561a",
        dashArray: "7 7",
        weight: 4,
      }).addTo(map);
      route.bindTooltip(t("Straight-line overview", locale));

      const tiles = L.tileLayer(
        import.meta.env["VITE_MAP_TILE_URL"] || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      ).addTo(map);
      tiles.on("tileerror", () => {
        setTileError(true);
        container.current?.setAttribute("data-tile-error", "true");
      });
      tiles.on("tileload", () => {
        setTileError(false);
        container.current?.removeAttribute("data-tile-error");
      });

      map.fitBounds(L.featureGroup([endpoints, route]).getBounds().pad(0.2), { maxZoom: 14 });
      cleanup = () => {
        map.remove();
        container.current?.replaceChildren();
      };
    }).catch(() => {
      if (!disposed) setMapError(true);
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [supplier.label, supplierLocation, shop.label, shopLocation, locale]);

  if (!supplierLocation || !shopLocation) {
    const missing = [
      !supplierLocation ? supplier.label : null,
      !shopLocation ? shop.label : null,
    ].filter(Boolean);
    return (
      <section className="order-route" aria-label={t("Order route overview", locale)}>
        <h3>{t("Route overview unavailable", locale)}</h3>
        <p>{tf("Saved coordinates are missing or invalid for {names}.", { names: missing.join(t(" and ", locale)) }, locale)}</p>
      </section>
    );
  }

  return (
    <section className="order-route" aria-label={t("Order route overview", locale)}>
      <h3>{t("Route overview", locale)}</h3>
      <p className="order-route-label">{t("Straight-line overview · not a road route or live vehicle location", locale)}</p>
      <div ref={container} className="order-route-map" role="region" aria-label={t("Supplier to shop route map", locale)} />
      <div className="order-route-endpoints">
        <span><i className="supplier-point" />{tf("Supplier: {name}", { name: supplier.label }, locale)}</span>
        <span><i className="shop-point" />{tf("Your shop: {name}", { name: shop.label }, locale)}</span>
      </div>
      {mapError && <p className="order-route-warning" role="status">{t("Map unavailable. Supplier and shop locations are listed above.", locale)}</p>}
      <p className="order-route-warning" role="status" hidden={!tileError}>{t("Map tiles are unavailable. The saved locations and order timeline are still shown.", locale)}</p>
    </section>
  );
}
