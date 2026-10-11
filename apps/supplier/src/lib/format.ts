import { format, formatDistanceToNow } from "date-fns";

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export const inr = (n: number) => inrFmt.format(n);
export const pack = (size: number, unit: string) => `${size} ${unit}`;
export const dateTime = (iso: string) => format(new Date(iso), "d MMM yyyy, h:mm a");
export const dateOnly = (iso: string) => format(new Date(iso), "d MMM yyyy");
export const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });
