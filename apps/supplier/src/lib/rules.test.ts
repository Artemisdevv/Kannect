import { describe, expect, it } from "vitest";
import { canTransition, safeDemand, shopBand } from "./rules";

describe("order transitions", () => {
  it("new orders can be accepted or rejected", () => {
    expect(canTransition("new", "accepted")).toBe(true);
    expect(canTransition("new", "rejected")).toBe(true);
  });
  it("cannot dispatch before accepting", () => {
    expect(canTransition("new", "dispatched")).toBe(false);
  });
  it("cannot deliver before dispatch", () => {
    expect(canTransition("accepted", "delivered")).toBe(false);
    expect(canTransition("dispatched", "delivered")).toBe(true);
  });
  it("rejected orders are final", () => {
    expect(canTransition("rejected", "accepted")).toBe(false);
  });
});

describe("demand threshold", () => {
  it("hides products with fewer than 3 shops", () => {
    const rows = safeDemand([
      { productName: "A", shopCount: 2 },
      { productName: "B", shopCount: 3 },
    ]);
    expect(rows.map((r) => r.productName)).toEqual(["B"]);
  });
  it("strips shop identities", () => {
    const [row] = safeDemand([{ productName: "B", shopCount: 4, shops: ["X Store"] }]);
    expect(row).not.toHaveProperty("shops");
  });
  it("shows shop counts as bands", () => {
    expect(shopBand(3)).toBe("3–4 shops");
    expect(shopBand(12)).toBe("10–24 shops");
  });
});
