// Sending a bill to a customer on WhatsApp. `wa.me` opens WhatsApp (the app on a phone, WhatsApp Web
// on a computer) with the message already typed; the shopkeeper picks the contact, or we go straight
// to a number when we know it.
import { rupees } from "@/lib/format";
import { getLocale, tf, type Locale } from "@/lib/i18n";

export function whatsappLink(text: string, phone?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length >= 10 ? digits : ""; // anything shorter is not a usable number
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/** The message that goes with the e-bill link, in the shopkeeper's language. */
export function billShareText(
  bill: { shop?: string | undefined; total: number; url: string },
  locale: Locale = getLocale(),
) {
  const vars = { shop: bill.shop ?? "", amount: rupees(bill.total), url: bill.url };
  return tf(bill.shop ? "Your bill from {shop}: {amount}. See it here: {url}" : "Your bill: {amount}. See it here: {url}", vars, locale);
}
