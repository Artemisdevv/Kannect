// Shopper data layer: public search, nearby shops, shop page and referral, from the Kannect API.
import { api, call } from "@/api/client";
import type { components } from "@/api/schema";

export type StockStatus = "in" | "low" | "out";
export type Coordinates = { latitude: number; longitude: number };
/** One shop's answer for one product (or just the shop, when browsing). */
export type ShopResult = {
  id: string;
  uid: string;
  name: string;
  area: string;
  address: string;
  phone?: string;
  product: string;
  productId?: string;
  price: number | null;
  status: StockStatus | null;
  coordinates: Coordinates | null;
  distanceKm?: number;
};
export type MapShop = ShopResult & { statuses?: (StockStatus | null)[] };
export type SearchResponse = { shops: ShopResult[]; cachedAt?: number };

export function resultMapShops(results: ShopResult[]): MapShop[] {
  const byId = new Map<string, MapShop>();
  for (const result of results) {
    const current = byId.get(result.id) ?? { ...result, statuses: [] };
    current.statuses = [...new Set([...(current.statuses ?? []), result.status])];
    byId.set(result.id, current);
  }
  return [...byId.values()];
}

export const areas = ["Kaloor", "Edappally", "Palarivattom", "Kakkanad", "Vyttila"] as const;
export const DEFAULT_AREA = "Kaloor";
export const isKnownArea = (area: string) => !!area.trim();
const RADIUS_M = 3000;

type ApiShop = components["schemas"]["PublicShop"];
type ApiProduct = components["schemas"]["Product"];
type ApiResult = components["schemas"]["SearchResult"];
const STATUS: Record<string, StockStatus> = { in_stock: "in", low: "low", out: "out" };
export const productName = (p?: ApiProduct) => [p?.brand, p?.name, p?.size].filter(Boolean).join(" ");

export function validCoordinates(c?: Coordinates | null): c is Coordinates {
  return !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;
}
function coordinates(shop?: ApiShop): Coordinates | null {
  const lat = shop?.location?.lat;
  const lng = shop?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const point = { latitude: lat, longitude: lng };
  return validCoordinates(point) ? point : null;
}
function distance(distanceM?: number | null) {
  return typeof distanceM === "number" && Number.isFinite(distanceM) && distanceM >= 0
    ? distanceM / 1000
    : undefined;
}
function parseStatus(value?: string): StockStatus | null {
  if (value === undefined) return null;
  const status = STATUS[value];
  if (!status) throw new Error("The server returned an unknown stock status.");
  return status;
}
function parsePrice(value?: number | null): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error("The server returned an invalid price.");
  return value;
}
function toShop(shop: ApiShop | undefined, extra: Partial<ShopResult>, area: string): ShopResult {
  const id = shop?.id;
  const name = shop?.name;
  if (!id || !name) throw new Error("The server returned incomplete shop details.");
  return {
    id,
    uid: id,
    name,
    area,
    address: shop.address ?? "",
    ...(shop.phone ? { phone: shop.phone } : {}),
    product: "",
    price: null,
    status: null,
    coordinates: coordinates(shop),
    ...extra,
  };
}
function fromResult(r: ApiResult, area: string): ShopResult {
  const distanceKm = distance(r.distance_m);
  const item = toShop(r.shop, {
    uid: `${r.shop?.id}:${r.product?.id}`,
    product: productName(r.product),
    ...(r.product?.id ? { productId: r.product.id } : {}),
    price: parsePrice(r.price),
    status: parseStatus(r.stock_status),
    ...(distanceKm !== undefined ? { distanceKm } : {}),
  }, area);
  if (!r.product?.id || !r.product.name) throw new Error("The server returned incomplete product details.");
  return item;
}
function originParams(area: string, coordinatesArg?: Coordinates) {
  if (validCoordinates(coordinatesArg)) return { lat: coordinatesArg.latitude, lng: coordinatesArg.longitude, radius_m: RADIUS_M };
  const normalizedArea = area.trim();
  if (!normalizedArea || normalizedArea === "Your location") {
    throw new Error("Choose an area or allow location access to find nearby shops.");
  }
  return { area: normalizedArea, radius_m: RADIUS_M };
}

export async function searchProducts(query: string, area: string, coordinatesArg?: Coordinates): Promise<SearchResponse> {
  const origin = originParams(area, coordinatesArg);
  const data = await call((signal) =>
    api.GET("/search", { params: { query: { q: query.trim(), ...origin, include_out: true } }, signal }),
  );
  return { shops: (data.results ?? []).map((r) => fromResult(r, area)) };
}

/** Shops around the shopper, nearest first, for browsing before any search. */
export async function nearbyShops(area: string, coordinatesArg?: Coordinates): Promise<ShopResult[]> {
  const origin = originParams(area, coordinatesArg);
  const data = await call((signal) =>
    api.GET("/shops/nearby", { params: { query: origin }, signal }),
  );
  return (data.shops ?? []).map((result) => {
    const distanceKm = distance(result.distance_m);
    return toShop(result.shop, { ...(distanceKm !== undefined ? { distanceKm } : {}) }, area);
  });
}

export type ShopPage = { shop: ShopResult; products: { productId: string; name: string; unit: 'piece' | 'gram'; price: number | null; status: StockStatus; reservable: number | null }[] };
export async function getShopPage(shopId: string, q?: string): Promise<ShopPage> {
  const data = await call((signal) =>
    api.GET("/shops/{shop_id}", { params: { path: { shop_id: shopId }, query: q ? { q } : {} }, signal }),
  );
  return {
    shop: toShop(data.shop, {}, ""),
    products: (data.products ?? []).map((p) => {
      const status = parseStatus(p.stock_status);
      if (!p.product?.id || !status) throw new Error("The server returned incomplete product availability.");
      return { productId: p.product.id, name: productName(p.product), unit: p.product.unit === 'gram' ? 'gram' as const : 'piece' as const, price: parsePrice(p.price), status, reservable: typeof p.reservable === 'number' ? Math.max(0, p.reservable) : null };
    }),
  };
}

/** The nearest other shop that has the product in stock, or null. */
export async function getReferral(shopId: string, productId: string): Promise<ShopResult | null> {
  const data = await call((signal) =>
    api.GET("/search/referral", { params: { query: { shop_id: shopId, product_id: productId } }, signal }),
  );
  return data.referral ? fromResult(data.referral as ApiResult, "") : null;
}
export function alternatives(shops: ShopResult[], selected: ShopResult) {
  return shops.filter((shop) => shop.id !== selected.id && shop.status === "in" && shop.productId === selected.productId);
}
export const rupees = (value: number | null) => value === null ? "Price not listed" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value);
