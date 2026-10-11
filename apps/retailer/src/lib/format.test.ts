import { describe, expect, it } from "vitest";

import { clampToStock, formatQty, lineTotal } from "./format";

describe("clampToStock: a bill never takes more than the shop has", () => {
  it("adds normally below the limit", () => {
    expect(clampToStock(0, 1, 5)).toEqual({ next: 1, max: 5, limited: false });
    expect(clampToStock(4, 1, 5)).toEqual({ next: 5, max: 5, limited: false });
  });

  it("stops at the stock count and says it was limited", () => {
    expect(clampToStock(5, 1, 5)).toEqual({ next: 5, max: 5, limited: true });
    expect(clampToStock(2, 10, 5)).toEqual({ next: 5, max: 5, limited: true });
  });

  it("an item with no stock cannot be added at all", () => {
    expect(clampToStock(0, 1, 0)).toEqual({ next: 0, max: 0, limited: true });
    expect(clampToStock(0, 1, -3)).toEqual({ next: 0, max: 0, limited: true });
    expect(clampToStock(0, 1, null)).toEqual({ next: 0, max: 0, limited: true });
  });

  it("removing never goes below zero and is never 'limited'", () => {
    expect(clampToStock(1, -1, 5)).toEqual({ next: 0, max: 5, limited: false });
    expect(clampToStock(0, -1, 5)).toEqual({ next: 0, max: 5, limited: false });
  });

  it("works in grams for loose goods", () => {
    expect(clampToStock(1750, 250, 2000)).toEqual({ next: 2000, max: 2000, limited: false });
    expect(clampToStock(2000, 250, 2000)).toEqual({ next: 2000, max: 2000, limited: true });
  });

  it("lowering stock below what is already in the cart trims it on the next change", () => {
    expect(clampToStock(8, 0, 5).next).toBe(5);
  });
});

describe("format helpers", () => {
  it("formats loose goods in kg and pieces plainly", () => {
    expect(formatQty(500, "gram")).toBe("500 g");
    expect(formatQty(2500, "gram")).toBe("2.5 kg");
    expect(formatQty(12, "piece")).toBe("12");
  });

  it("prices loose goods per kg", () => {
    expect(lineTotal(40, 500, "gram")).toBe(20);
    expect(lineTotal(45, 3, "piece")).toBe(135);
  });
});
