import type { DemandSignal, OrderStatus } from "./api/types";

/** Allowed order status changes. The backend stays authoritative. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["accepted", "rejected"],
  accepted: ["dispatched"],
  dispatched: ["delivered"],
  delivered: [],
  rejected: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return ORDER_TRANSITIONS[from].includes(to);
}

export const DEMAND_MIN_SHOPS = 3;

/** Drops anything below the shop threshold and strips any extra fields
 * (e.g. shop names) the API might accidentally include. */
export function safeDemand(rows: unknown[]): DemandSignal[] {
  return rows
    .map((r) => r as Partial<DemandSignal> & Record<string, unknown>)
    .filter((r) => typeof r.shopCount === "number" && (r.shopCount!) >= DEMAND_MIN_SHOPS)
    .map((r) => ({
      productName: String(r.productName ?? ""),
      category: String(r.category ?? ""),
      packSize: Number(r.packSize ?? 0),
      unit: String(r.unit ?? ""),
      shopCount: r.shopCount!,
      totalPacks: Number(r.totalPacks ?? 0),
      period: String(r.period ?? ""),
    }));
}

/** Shop counts are shown as bands so exact counts can't identify retailers. */
export function shopBand(n: number) {
  if (n < 5) return "3–4 shops";
  if (n < 10) return "5–9 shops";
  if (n < 25) return "10–24 shops";
  return "25+ shops";
}

export const ILLUSTRATIVE_GST_RATE = 0.05;
