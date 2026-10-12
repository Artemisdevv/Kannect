import { getLocale, t, tf, type Locale } from "@/lib/i18n";

// Input rules shared by the forms. The server checks the same limits, so these are for fast,
// readable feedback, not the only line of defence.

export const LIMITS = { shopName: { min: 2, max: 120 }, ownerName: { max: 120 }, address: { max: 500 } };

/** Collapse runs of spaces and trim, like the server does. */
export const tidy = (value: string) => value.split(/\s+/).filter(Boolean).join(" ");

export type PhoneResult = { e164: string; error?: undefined } | { e164?: undefined; error: string };

/** An Indian mobile number: 10 digits starting 6-9, optionally written with +91, 91 or 0 in front. */
export function parsePhone(input: string, locale: Locale = getLocale()): PhoneResult {
  let digits = input.replace(/[\s\-().]/g, "");
  if (/[^\d+]/.test(digits) || digits.indexOf("+") > 0) {
    return { error: t("Use digits only, for example 98765 43210.", locale) };
  }
  digits = digits.replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10) return { error: t("A mobile number has 10 digits.", locale) };
  if (!/^[6-9]/.test(digits)) return { error: t("Mobile numbers start with 6, 7, 8 or 9.", locale) };
  return { e164: `+91${digits}` };
}

export type ShopForm = { name: string; owner_name: string; address: string };
export type ShopErrors = Partial<Record<keyof ShopForm, string>>;

export function validateShop(form: ShopForm, locale: Locale = getLocale()): ShopErrors {
  const errors: ShopErrors = {};
  const name = tidy(form.name);
  if (name.length < LIMITS.shopName.min) errors.name = t("Enter your shop's name (at least 2 letters).", locale);
  else if (name.length > LIMITS.shopName.max) errors.name = tf("Keep the name under {max} characters.", { max: LIMITS.shopName.max }, locale);
  else if (!/[\p{L}\p{N}]/u.test(name)) errors.name = t("The name needs letters or numbers.", locale);
  if (tidy(form.owner_name).length > LIMITS.ownerName.max) errors.owner_name = t("That name is too long.", locale);
  if (tidy(form.address).length > LIMITS.address.max) errors.address = tf("Keep the address under {max} characters.", { max: LIMITS.address.max }, locale);
  return errors;
}
