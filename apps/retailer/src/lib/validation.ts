// Input rules shared by the forms. The server checks the same limits, so these are for fast,
// readable feedback, not the only line of defence.

export const LIMITS = { shopName: { min: 2, max: 120 }, ownerName: { max: 120 }, address: { max: 500 } };

/** Collapse runs of spaces and trim, like the server does. */
export const tidy = (value: string) => value.split(/\s+/).filter(Boolean).join(" ");

export type PhoneResult = { e164: string; error?: undefined } | { e164?: undefined; error: string };

/** An Indian mobile number: 10 digits starting 6-9, optionally written with +91, 91 or 0 in front. */
export function parsePhone(input: string): PhoneResult {
  let digits = input.replace(/[\s\-().]/g, "");
  if (/[^\d+]/.test(digits) || digits.indexOf("+") > 0) {
    return { error: "Use digits only, for example 98765 43210." };
  }
  digits = digits.replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10) return { error: "A mobile number has 10 digits." };
  if (!/^[6-9]/.test(digits)) return { error: "Mobile numbers start with 6, 7, 8 or 9." };
  return { e164: `+91${digits}` };
}

export type ShopForm = { name: string; owner_name: string; address: string };
export type ShopErrors = Partial<Record<keyof ShopForm, string>>;

export function validateShop(form: ShopForm): ShopErrors {
  const errors: ShopErrors = {};
  const name = tidy(form.name);
  if (name.length < LIMITS.shopName.min) errors.name = "Enter your shop's name (at least 2 letters).";
  else if (name.length > LIMITS.shopName.max) errors.name = `Keep the name under ${LIMITS.shopName.max} characters.`;
  else if (!/[\p{L}\p{N}]/u.test(name)) errors.name = "The name needs letters or numbers.";
  if (tidy(form.owner_name).length > LIMITS.ownerName.max) errors.owner_name = "That name is too long.";
  if (tidy(form.address).length > LIMITS.address.max) errors.address = `Keep the address under ${LIMITS.address.max} characters.`;
  return errors;
}
