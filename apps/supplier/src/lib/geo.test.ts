import { afterEach, describe, expect, it, vi } from "vitest";
import { currentLocation } from "./geo";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const stubGeolocation = (impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) =>
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: impl } });

describe("currentLocation", () => {
  it("returns the device position", async () => {
    stubGeolocation((ok) => ok({ coords: { latitude: 11.25, longitude: 75.78 } } as GeolocationPosition));
    await expect(currentLocation()).resolves.toEqual({ lat: 11.25, lng: 75.78 });
  });

  it("returns null when permission is denied", async () => {
    stubGeolocation((_ok, fail) => fail({ code: 1 } as GeolocationPositionError));
    await expect(currentLocation()).resolves.toBeNull();
  });

  it("returns null when there is no geolocation at all", async () => {
    vi.stubGlobal("navigator", {});
    await expect(currentLocation()).resolves.toBeNull();
  });

  it("gives up when the permission prompt is never answered", async () => {
    vi.useFakeTimers();
    stubGeolocation(() => {
      /* the browser is still showing its prompt: no callback, ever */
    });
    const pending = currentLocation(5000);
    await vi.advanceTimersByTimeAsync(5100);
    await expect(pending).resolves.toBeNull();
  });
});
