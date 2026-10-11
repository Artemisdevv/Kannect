import { useEffect, useRef, useState } from "react";
import type { components } from "@/api/schema";
import "leaflet/dist/leaflet.css";

type Location = components["schemas"]["Location"];

export type RouteEndpoint = {
  label: string;
  location: Location | undefined;
};

function validLocation(location: Location | undefined): location is Location {
  return (
    location !== undefined &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    location.lat >= -90 &&
    location.lat <= 90 &&
    location.lng >= -180 &&
    location.lng <= 180
  );
}

export function OrderRouteMap({ supplier, shop }: { supplier: RouteEndpoint; shop: RouteEndpoint }) {
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
      const endpoints = L.featureGroup().addTo(map);
      L.circleMarker(supplierPoint, {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#633b13",
        fillOpacity: 1,
      })
        .bindTooltip(supplier.label)
        .addTo(endpoints);
      L.circleMarker(shopPoint, {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#18834b",
        fillOpacity: 1,
      })
        .bindTooltip(shop.label)
        .addTo(endpoints);

      const route = L.polyline([supplierPoint, shopPoint], {
        color: "#87561a",
        dashArray: "7 7",
        weight: 4,
      }).addTo(map);
      route.bindTooltip("Straight-line overview");

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
  }, [supplier.label, supplierLocation, shop.label, shopLocation]);

  if (!supplierLocation || !shopLocation) {
    const missing = [
      !supplierLocation ? supplier.label : null,
      !shopLocation ? shop.label : null,
    ].filter(Boolean);
    return (
      <section className="order-route" aria-label="Order route overview">
        <h3>Route overview unavailable</h3>
        <p>Saved coordinates are missing or invalid for {missing.join(" and ")}.</p>
      </section>
    );
  }

  return (
    <section className="order-route" aria-label="Order route overview">
      <h3>Route overview</h3>
      <p className="order-route-label">Straight-line overview · not a road route or live vehicle location</p>
      <div ref={container} className="order-route-map" role="region" aria-label="Supplier to shop route map" />
      <div className="order-route-endpoints">
        <span><i className="supplier-point" />Supplier: {supplier.label}</span>
        <span><i className="shop-point" />Your shop: {shop.label}</span>
      </div>
      {mapError && <p className="order-route-warning" role="status">Map unavailable. Supplier and shop locations are listed above.</p>}
      <p className="order-route-warning" role="status" hidden={!tileError}>Map tiles are unavailable. The saved locations and order timeline are still shown.</p>
    </section>
  );
}
