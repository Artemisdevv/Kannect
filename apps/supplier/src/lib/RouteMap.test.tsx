import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const leaflet = vi.hoisted(() => ({ markers: 0, hasView: false }));

vi.mock("leaflet", () => {
  const group = { addTo: vi.fn(() => group), getBounds: vi.fn(() => ({ pad: vi.fn(() => ({})) })) };
  const marker = { bindTooltip: vi.fn(() => marker), addTo: vi.fn(() => marker) };
  const line = { bindTooltip: vi.fn(() => line), addTo: vi.fn(() => line) };
  const tiles = { addTo: vi.fn(() => tiles), on: vi.fn(() => tiles) };
  // Real Leaflet throws when a marker is added to a map that has no view yet.
  const map = {
    setView: vi.fn(() => { leaflet.hasView = true; return map; }),
    fitBounds: vi.fn(() => { leaflet.hasView = true; }),
    remove: vi.fn(),
  };
  return {
    map: vi.fn(() => map),
    featureGroup: vi.fn(() => group),
    circleMarker: vi.fn(() => {
      if (!leaflet.hasView) throw new TypeError("Cannot read properties of undefined (reading 'intersects')");
      leaflet.markers += 1;
      return marker;
    }),
    polyline: vi.fn(() => line),
    tileLayer: vi.fn(() => tiles),
  };
});
vi.mock("leaflet/dist/leaflet.css", () => ({}));

import { RouteMap } from "./RouteMap";

beforeEach(() => {
  leaflet.markers = 0;
  leaflet.hasView = false;
});

describe("RouteMap", () => {
  it("draws both endpoints and shows no error when the locations are valid", async () => {
    render(
      <RouteMap
        supplier={{ label: "Malabar Wholesale", location: { lat: 11.25, lng: 75.78 } }}
        shop={{ label: "Mary Stores", location: { lat: 11.3, lng: 75.8 } }}
      />,
    );
    await waitFor(() => expect(leaflet.markers).toBe(2));
    expect(screen.queryByText(/Map unavailable/)).toBeNull();
  });

  it("explains what is missing instead of drawing when a location is missing", () => {
    render(
      <RouteMap
        supplier={{ label: "Malabar Wholesale", location: { lat: 11.25, lng: 75.78 } }}
        shop={{ label: "Mary Stores", location: null }}
      />,
    );
    expect(screen.getByText(/Route overview unavailable/)).toBeTruthy();
    expect(leaflet.markers).toBe(0);
  });
});
