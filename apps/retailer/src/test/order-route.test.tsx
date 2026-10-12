import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrdersPage } from "@/features/orders/orders-page";

const leaflet = vi.hoisted(() => ({
  markers: [] as Array<{ bindTooltip: ReturnType<typeof vi.fn>; addTo: ReturnType<typeof vi.fn> }>,
  lineTooltips: [] as string[],
  triggerTileError: false,
  hasView: false,
}));

vi.mock("leaflet", () => {
  const layer = { addTo: vi.fn(() => layer), getBounds: vi.fn(() => ({ pad: vi.fn(() => ({})) })) };
  const marker = {
    bindTooltip: vi.fn(() => marker),
    addTo: vi.fn(() => marker),
  };
  const tiles = {
    addTo: vi.fn(() => tiles),
    on: vi.fn((event: string, callback: () => void) => {
      if (event === "tileerror" && leaflet.triggerTileError) queueMicrotask(callback);
      return tiles;
    }),
  };
  // Real Leaflet throws when a marker is added to a map that has no view yet.
  const map = {
    fitBounds: vi.fn(() => { leaflet.hasView = true; }),
    setView: vi.fn(() => { leaflet.hasView = true; return map; }),
    remove: vi.fn(),
  };
  const polyline = {
    bindTooltip: vi.fn((text: string) => { leaflet.lineTooltips.push(text); return polyline; }),
    addTo: vi.fn(() => polyline),
  };
  return {
    map: vi.fn(() => map),
    featureGroup: vi.fn(() => layer),
    circleMarker: vi.fn(() => {
      if (!leaflet.hasView) throw new TypeError("Cannot read properties of undefined (reading 'intersects')");
      leaflet.markers.push(marker);
      return marker;
    }),
    polyline: vi.fn(() => polyline),
    tileLayer: vi.fn(() => tiles),
  };
});

vi.mock("leaflet/dist/leaflet.css", () => ({}));

vi.mock("@/features/queries", () => ({
  keys: { orders: ["shop", "orders"] },
  useOrders: () => ({ data: [order], isLoading: false }),
  useReorderSuggestions: () => ({ data: [] }),
  useReceiveOrder: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock("@/api", () => ({
  ApiError: class ApiError extends Error {},
  cancelOrder: vi.fn(),
  placeOrder: vi.fn(),
}));

vi.mock("@/components/kannect/shell", () => ({
  Heading: ({ title }: { title: string }) => <h2>{title}</h2>,
  Shell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  useShop: () => null,
}));

const order = {
  id: "order-1",
  total: 200,
  status: "dispatched",
  supplier: {
    name: "Wholesale Supplier",
    location: { lat: 10.02, lng: 76.3 },
  },
  shop: { name: "My Shop", location: { lat: 10.01, lng: 76.31 } },
  items: [],
  tracking: [
    { status: "dispatched" as const, at: "2026-10-10T10:00:00Z", eta: "2026-10-12T10:00:00Z" },
    { status: "accepted" as const, at: "2026-10-09T10:00:00Z", eta: "2026-10-11T10:00:00Z" },
  ],
};

const validShopLocation = { lat: 10.01, lng: 76.31 };
const validTracking = [
  { status: "dispatched" as const, at: "2026-10-10T10:00:00Z", eta: "2026-10-12T10:00:00Z" },
  { status: "accepted" as const, at: "2026-10-09T10:00:00Z", eta: "2026-10-11T10:00:00Z" },
];

function resetOrder() {
  order.shop.location = validShopLocation;
  order.tracking = validTracking;
}

function renderOrders() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OrdersPage />
    </QueryClientProvider>,
  );
}

describe("retailer order route details", () => {
  it("sorts tracking chronologically and displays the latest ETA", async () => {
    resetOrder();
    renderOrders();
    fireEvent.click(screen.getByRole("button", { name: /Wholesale Supplier/ }));

    const timeline = screen.getByRole("region", { name: "Order tracking" });
    const events = timeline.querySelectorAll("li");
    expect(events[0]).toHaveTextContent("Accepted");
    expect(events[1]).toHaveTextContent("On the way");
    expect(timeline).toHaveTextContent("Expected");
    expect(timeline).toHaveTextContent(new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date("2026-10-12T10:00:00Z")));
  });

  it("renders a labelled straight-line map when both saved locations are valid", async () => {
    resetOrder();
    leaflet.markers = [];
    leaflet.triggerTileError = false;
    leaflet.hasView = false;
    renderOrders();
    fireEvent.click(screen.getByRole("button", { name: /Wholesale Supplier/ }));

    const mapRegion = screen.getByRole("region", { name: "Supplier to shop route map" });
    expect(mapRegion).toBeInTheDocument();
    await waitFor(() => expect(leaflet.markers).toHaveLength(2));
    expect(leaflet.lineTooltips).toContain("Straight-line overview");
    expect(screen.getByText(/not a road route or live vehicle location/)).toBeInTheDocument();
  });

  it("keeps timeline visible and explains missing or invalid locations and ETA", () => {
    resetOrder();
    order.shop.location = { lat: 100, lng: 76.31 };
    order.tracking = [{ status: "accepted", at: "invalid-date", eta: "" }];
    renderOrders();
    fireEvent.click(screen.getByRole("button", { name: /Wholesale Supplier/ }));

    expect(screen.getByText(/missing or invalid for My Shop/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Order tracking" })).toHaveTextContent("No ETA provided");
    expect(screen.getByRole("region", { name: "Order tracking" })).toHaveTextContent("No tracking updates yet");

    resetOrder();
  });

  it("reports unavailable tiles while keeping tracking visible", async () => {
    resetOrder();
    leaflet.hasView = false;
    leaflet.triggerTileError = true;
    renderOrders();
    fireEvent.click(screen.getByRole("button", { name: /Wholesale Supplier/ }));

    expect(await screen.findByText(/Map tiles are unavailable/)).toBeVisible();
    expect(screen.getByRole("region", { name: "Order tracking" })).toBeInTheDocument();
    leaflet.triggerTileError = false;
  });

});
