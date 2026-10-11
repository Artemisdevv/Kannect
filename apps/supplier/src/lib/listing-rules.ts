/** Extra checks for the live API: it stores whole packs and whole paise, and would otherwise reject
 * (or, for pack size, we would round) what was typed. */
export function liveListingErrors(v: { packSize: number; wholesalePrice: number }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!Number.isInteger(v.packSize)) e["packSize"] = "Pack size must be a whole number.";
  if (Math.abs(v.wholesalePrice * 100 - Math.round(v.wholesalePrice * 100)) > 1e-6)
    e["wholesalePrice"] = "Price can have at most 2 decimal places.";
  return e;
}
