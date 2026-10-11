import { describe, expect, it } from "vitest";
import { liveListingErrors } from "./listing-rules";

describe("liveListingErrors", () => {
  it("accepts a whole pack size and a price in whole paise", () => {
    expect(liveListingErrors({ packSize: 12, wholesalePrice: 99.5 })).toEqual({});
    expect(liveListingErrors({ packSize: 1, wholesalePrice: 100 })).toEqual({});
  });
  it("rejects a fractional pack size instead of rounding it", () => {
    expect(liveListingErrors({ packSize: 2.5, wholesalePrice: 10 })).toHaveProperty("packSize");
    expect(liveListingErrors({ packSize: 0.4, wholesalePrice: 10 })).toHaveProperty("packSize");
  });
  it("rejects a price with more than two decimals", () => {
    expect(liveListingErrors({ packSize: 12, wholesalePrice: 99.999 })).toHaveProperty("wholesalePrice");
  });
});
