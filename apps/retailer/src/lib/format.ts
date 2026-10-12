import { getLocale, t, tf, type Locale } from "@/lib/i18n";
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

export function formatQty(qty: number | null | undefined, unit: Unit, locale: Locale = getLocale()): string {
  if (qty === null || qty === undefined) return t("Unknown", locale);
  if (unit === "gram") {
    return qty >= 1000 ? tf("{n} kg", { n: +(qty / 1000).toFixed(2) }, locale) : tf("{n} g", { n: qty }, locale);
  }
  return `${qty}`;
}

export function priceLabel(price: number | undefined, unit: Unit, locale: Locale = getLocale()): string {
  if (price === undefined) return "-";
  return unit === "gram" ? tf("{price}/kg", { price: rupees(price) }, locale) : rupees(price);
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
  return `${size}${formatQty(row.stock_qty, p?.unit)} ${p?.unit === "gram" ? "" : t("left")}`.trim();
}

export const newId = () => crypto.randomUUID();

/**
 * Change a cart quantity without ever selling more than the shop has. Returns the new quantity and
 * whether the stock limit stopped part of the change (so the screen can say so).
 */
export function clampToStock(current: number, delta: number, stock: number | null | undefined) {
  const max = Math.max(0, stock ?? 0);
  const wanted = current + delta;
  const next = Math.min(Math.max(0, wanted), max);
  return { next, max, limited: delta > 0 && wanted > max };
}

const SHOP_TYPE_LABELS: Record<string, string> = {
  grocery: "Grocery",
  provision: "Provision store",
  vegetable: "Vegetables",
  bakery: "Bakery",
  stationery: "Stationery",
  general: "General store",
};
/** A shop type, ready to show: translated, and plain words for a type we do not know. */
export function shopTypeLabel(type: string | undefined, locale?: Locale) {
  if (!type) return "";
  const english = SHOP_TYPE_LABELS[type];
  return english ? t(english, locale) : type;
}

const ORDER_STATUS_TEXT: Record<string, string> = {
  placed: "Waiting for supplier",
  accepted: "Accepted",
  rejected: "Rejected",
  dispatched: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
/** An order status, ready to show: translated, and the raw word for a status we do not know. */
export function orderStatusLabel(status: string | undefined, locale?: Locale) {
  const english = ORDER_STATUS_TEXT[status ?? ""];
  return english ? t(english, locale) : (status ?? "");
}
