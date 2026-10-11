// Small, pure helpers for the group-buy screens. The API already says the current price and how
// many packs the shop committed (`current_price`, `my_packs`); these only shape it for display.
import { getLocale, t, tf, type Locale } from "@/lib/i18n";

export const MAX_PACKS = 100000; // the API's limit for one commitment

type Tier = { min_packs: number; price: number };

/** Progress toward the best (largest) tier, and what the next tier needs and costs. */
export function tierProgress(tiers: Tier[] | undefined, pooled: number) {
  const sorted = [...(tiers ?? [])].sort((a, b) => a.min_packs - b.min_packs);
  const best = sorted.at(-1);
  if (!best || best.min_packs <= 0) return { top: 0, percent: 0, next: null };
  const upcoming = sorted.find((t) => t.min_packs > pooled);
  return {
    top: best.min_packs,
    percent: Math.max(0, Math.min(100, Math.round((pooled / best.min_packs) * 100))),
    next: upcoming ? { morePacks: upcoming.min_packs - pooled, price: upcoming.price } : null,
  };
}

/** A group buy takes no more packs once it is not open, or its deadline has passed. */
export function isClosed(gb: { status?: string | undefined; deadline?: string | undefined }, now = Date.now()) {
  if (gb.status !== "open") return true;
  const end = gb.deadline ? Date.parse(gb.deadline) : NaN;
  return Number.isNaN(end) || end <= now;
}

/** A whole number of packs between 1 and the API's limit; anything else becomes 1. */
export function clampPacks(raw: number | string): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_PACKS, Math.floor(n));
}

export function productLabel(
  product?: { brand?: string | null; name?: string; size?: string | null },
  locale: Locale = getLocale(),
) {
  return [product?.brand, product?.name, product?.size].filter(Boolean).join(" ") || t("Product", locale);
}

export function packSizeLabel(packSize?: number, unit?: string, locale: Locale = getLocale()) {
  if (!packSize) return "";
  return tf(unit === "gram" ? "{n} g per pack" : "{n} pcs per pack", { n: packSize }, locale);
}

/** "in 3 days", "in 5 hours", "in 30 minutes", "Closed": words, so every language can say it. */
export function deadlineLabel(deadline: string | undefined, locale: Locale = getLocale(), now = Date.now()) {
  const end = deadline ? Date.parse(deadline) : NaN;
  if (Number.isNaN(end)) return "—";
  const ms = end - now;
  if (ms <= 0) return t("Closed", locale);
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return t("in less than a minute", locale);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return tf(days === 1 ? "in {n} day" : "in {n} days", { n: days }, locale);
  if (hours >= 1) return tf(hours === 1 ? "in {n} hour" : "in {n} hours", { n: hours }, locale);
  return tf(minutes === 1 ? "in {n} minute" : "in {n} minutes", { n: minutes }, locale);
}
