import { describe, expect, it } from "vitest";
import { MAX_PACKS, clampPacks, deadlineLabel, isClosed, packSizeLabel, productLabel, tierProgress } from "./helpers";

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

describe("deadlineLabel", () => {
  const now = Date.parse("2026-10-12T10:00:00Z");
  const at = (ms: number) => new Date(now + ms).toISOString();
  const H = 3600000;

  it("counts days, hours and minutes in plain words", () => {
    expect(deadlineLabel(at(3 * 24 * H), "en", now)).toBe("in 3 days");
    expect(deadlineLabel(at(24 * H), "en", now)).toBe("in 1 day");
    expect(deadlineLabel(at(5 * H), "en", now)).toBe("in 5 hours");
    expect(deadlineLabel(at(H), "en", now)).toBe("in 1 hour");
    expect(deadlineLabel(at(30 * 60000), "en", now)).toBe("in 30 minutes");
    expect(deadlineLabel(at(60000), "en", now)).toBe("in 1 minute");
  });

  it("says it is about to close, then that it has closed", () => {
    expect(deadlineLabel(at(20000), "en", now)).toBe("in less than a minute");
    expect(deadlineLabel(at(0), "en", now)).toBe("Closed");
    expect(deadlineLabel(at(-H), "en", now)).toBe("Closed");
  });

  it("shows a dash when there is no usable deadline", () => {
    expect(deadlineLabel(undefined, "en", now)).toBe("—");
    expect(deadlineLabel("soon", "en", now)).toBe("—");
  });

  it("is fully Malayalam when the language is Malayalam", () => {
    for (const ms of [3 * 24 * H, H, 30 * 60000, 20000, -H]) {
      expect(deadlineLabel(at(ms), "ml", now)).not.toMatch(/[A-Za-z]/);
    }
  });

  it("describes the pack size in Malayalam too", () => {
    expect(packSizeLabel(12, "piece", "ml")).not.toMatch(/[A-Za-z]/);
    expect(packSizeLabel(1000, "gram", "ml")).not.toMatch(/[A-Za-z]/);
  });
});
