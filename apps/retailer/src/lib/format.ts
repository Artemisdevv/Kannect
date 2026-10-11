// Money is rupees. Stock and quantities are integers in base units: pieces, or grams for loose
// goods (which are priced per kg). These helpers keep that in one place.
import type { ShopProduct } from "@/api";

export const rupees = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "-"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: n % 1 === 0 ? 0 : 2,
      }).format(n);

type Unit = "piece" | "gram" | string | undefined;

export function formatQty(qty: number | null | undefined, unit: Unit): string {
  if (qty === null || qty === undefined) return "Unknown";
  if (unit === "gram") {
    return qty >= 1000 ? `${+(qty / 1000).toFixed(2)} kg` : `${qty} g`;
  }
  return `${qty}`;
}

export function priceLabel(price: number | undefined, unit: Unit): string {
  if (price === undefined) return "-";
  return unit === "gram" ? `${rupees(price)}/kg` : rupees(price);
}

/** Line total in rupees: price is per piece, or per kg for gram items. */
export function lineTotal(price: number, qty: number, unit: Unit): number {
  const amount = unit === "gram" ? (price * qty) / 1000 : price * qty;
  return Math.round(amount * 100) / 100;
}

/** How much one tap of + / - changes a quantity: one piece, or 250 g for loose goods. */
export const stepFor = (unit: Unit) => (unit === "gram" ? 250 : 1);

export const STATUS_LABEL: Record<string, string> = {
  in_stock: "In stock",
  low: "Low stock",
  out: "Out of stock",
};

export function statusClass(status: string | undefined): string {
  if (status === "out") return "danger";
  if (status === "low") return "warning";
  return "";
}

export function productSub(row: ShopProduct): string {
  const p = row.product;
  const size = p?.size ? `${p.size} · ` : "";
  return `${size}${formatQty(row.stock_qty, p?.unit)} ${p?.unit === "gram" ? "" : "left"}`.trim();
}

export const newId = () => crypto.randomUUID();
