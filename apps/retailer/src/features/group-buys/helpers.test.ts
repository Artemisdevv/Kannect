import { describe, expect, it } from "vitest";
import { MAX_PACKS, clampPacks, isClosed, packSizeLabel, productLabel, tierProgress } from "./helpers";

const tiers = [
  { min_packs: 40, price: 80 },
  { min_packs: 10, price: 95 },
  { min_packs: 20, price: 88 },
];

describe("tierProgress", () => {
  it("measures progress toward the best tier and names the next one", () => {
    const p = tierProgress(tiers, 12);
    expect(p.top).toBe(40);
    expect(p.percent).toBe(30);
    expect(p.next).toEqual({ morePacks: 8, price: 88 });
  });

  it("has no next tier once the best one is reached, and never exceeds 100%", () => {
    const p = tierProgress(tiers, 55);
    expect(p.next).toBeNull();
    expect(p.percent).toBe(100);
  });

  it("copes with no tiers or no packs yet", () => {
    expect(tierProgress([], 3)).toEqual({ top: 0, percent: 0, next: null });
    expect(tierProgress(tiers, 0).percent).toBe(0);
    expect(tierProgress(undefined, 0)).toEqual({ top: 0, percent: 0, next: null });
  });
});

describe("isClosed", () => {
  const now = Date.parse("2026-10-12T10:00:00Z");
  it("is open before the deadline", () => {
    expect(isClosed({ status: "open", deadline: "2026-10-13T10:00:00Z" }, now)).toBe(false);
  });
  it("is closed at or after the deadline, even if the server still says open", () => {
    expect(isClosed({ status: "open", deadline: "2026-10-12T10:00:00Z" }, now)).toBe(true);
    expect(isClosed({ status: "open", deadline: "2026-10-11T10:00:00Z" }, now)).toBe(true);
  });
  it("is closed when confirmed or failed", () => {
    expect(isClosed({ status: "confirmed", deadline: "2026-10-13T10:00:00Z" }, now)).toBe(true);
    expect(isClosed({ status: "failed", deadline: "2026-10-13T10:00:00Z" }, now)).toBe(true);
  });
  it("treats a missing or unreadable deadline as closed", () => {
    expect(isClosed({ status: "open", deadline: undefined }, now)).toBe(true);
    expect(isClosed({ status: "open", deadline: "soon" }, now)).toBe(true);
  });
});

describe("clampPacks", () => {
  it("keeps whole numbers from 1 up to the API limit", () => {
    expect(clampPacks(5)).toBe(5);
    expect(clampPacks("12")).toBe(12);
    expect(clampPacks(MAX_PACKS + 50)).toBe(MAX_PACKS);
  });
  it("falls back to 1 for empty, zero, negative, fractional or non-numeric input", () => {
    expect(clampPacks("")).toBe(1);
    expect(clampPacks(0)).toBe(1);
    expect(clampPacks(-4)).toBe(1);
    expect(clampPacks("abc")).toBe(1);
    expect(clampPacks(2.7)).toBe(2);
  });
});

describe("labels", () => {
  it("names the product with brand and size, like the rest of the app", () => {
    expect(productLabel({ brand: "Malabar", name: "Jaya Rice", size: "25 kg" })).toBe("Malabar Jaya Rice 25 kg");
    expect(productLabel({ name: "Tomato" })).toBe("Tomato");
    expect(productLabel(undefined)).toBe("Product");
  });
  it("describes a pack in pieces or grams", () => {
    expect(packSizeLabel(12, "piece")).toBe("12 pcs per pack");
    expect(packSizeLabel(1000, "gram")).toBe("1000 g per pack");
    expect(packSizeLabel(undefined, undefined)).toBe("");
  });
});
