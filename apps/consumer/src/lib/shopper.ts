// Shopper data layer: public search, nearby shops, shop page and referral, from the Kannect API.
import { api, call } from '@/api/client';
import type { components } from '@/api/schema';

export type StockStatus = 'in' | 'low' | 'out';
export type Coordinates = { latitude: number; longitude: number };

/** One shop's answer for one product (or just the shop, when browsing). */
export type ShopResult = {
  id: string;
  uid: string; // shop + product, unique in a list (a shop can match several products)
  name: string;
  area: string;
  address: string;
  phone?: string;
  product: string;
  productId?: string;
  price: number;
  status: StockStatus;
  coordinates: Coordinates;
  distanceKm?: number;
};
export type SearchResponse = { shops: ShopResult[]; cachedAt?: number };

// Neighbourhoods to pick when the shopper does not share their location. Approximate centres.
export const areaCenters: Record<string, Coordinates> = {
  Kaloor: { latitude: 9.999, longitude: 76.302 },
  Edappally: { latitude: 10.0254, longitude: 76.3083 },
  Palarivattom: { latitude: 10.0042, longitude: 76.307 },
  Kakkanad: { latitude: 10.0159, longitude: 76.3419 },
  Vyttila: { latitude: 9.9672, longitude: 76.32 },
};
export const areas = Object.keys(areaCenters);
export const DEFAULT_AREA = 'Kaloor';
export const isKnownArea = (area: string) => area in areaCenters || area === 'Your location';

const RADIUS_M = 3000;

type ApiShop = components['schemas']['PublicShop'];
type ApiProduct = components['schemas']['Product'];
type ApiResult = components['schemas']['SearchResult'];

const STATUS: Record<string, StockStatus> = { in_stock: 'in', low: 'low', out: 'out' };
export const productName = (p?: ApiProduct) => [p?.brand, p?.name, p?.size].filter(Boolean).join(' ');

function toShop(shop: ApiShop | undefined, extra: Partial<ShopResult>, area: string): ShopResult {
  const id = shop?.id ?? '';
  return {
    id,
    uid: id,
    name: shop?.name ?? 'Shop',
    area,
    address: shop?.address ?? '',
    ...(shop?.phone ? { phone: shop.phone } : {}),
    product: '',
    price: 0,
    status: 'in',
    coordinates: { latitude: shop?.location?.lat ?? 0, longitude: shop?.location?.lng ?? 0 },
    ...extra,
  };
}

function fromResult(r: ApiResult, area: string): ShopResult {
  return toShop(
    r.shop,
    {
      uid: `${r.shop?.id}:${r.product?.id}`,
      product: productName(r.product),
      ...(r.product?.id ? { productId: r.product.id } : {}),
      price: r.price ?? 0,
      status: STATUS[r.stock_status ?? 'in_stock'] ?? 'in',
      ...(r.distance_m !== undefined ? { distanceKm: r.distance_m / 1000 } : {}),
    },
    area,
  );
}

export function distanceKm(a: Coordinates, b: Coordinates) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function validCoordinates(c?: Coordinates): c is Coordinates {
  return !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;
}

/** Where to search around: the shopper's location if they shared it, else the chosen area's centre. */
export function origin(area: string, coordinates?: Coordinates): Coordinates {
  if (validCoordinates(coordinates)) return coordinates;
  return areaCenters[area] ?? areaCenters[DEFAULT_AREA]!;
}

export async function searchProducts(query: string, area: string, coordinates?: Coordinates): Promise<SearchResponse> {
  const o = origin(area, coordinates);
  const data = await call((signal) =>
    api.GET('/search', { params: { query: { q: query.trim(), lat: o.latitude, lng: o.longitude, radius_m: RADIUS_M, include_out: true } }, signal }),
  );
  return { shops: (data.results ?? []).map(r => fromResult(r, area)) };
}

/** Shops around the shopper, nearest first, for browsing before any search. */
export async function nearbyShops(area: string, coordinates?: Coordinates): Promise<ShopResult[]> {
  const o = origin(area, coordinates);
  const data = await call((signal) =>
    api.GET('/shops/nearby', { params: { query: { lat: o.latitude, lng: o.longitude, radius_m: RADIUS_M } }, signal }),
  );
  return (data.shops ?? []).map(s => toShop(s.shop, { ...(s.distance_m !== undefined ? { distanceKm: s.distance_m / 1000 } : {}) }, area));
}

export type ShopPage = { shop: ShopResult; products: { productId: string; name: string; price: number; status: StockStatus }[] };

export async function getShopPage(shopId: string, q?: string): Promise<ShopPage> {
  const data = await call((signal) =>
    api.GET('/shops/{shop_id}', { params: { path: { shop_id: shopId }, query: q ? { q } : {} }, signal }),
  );
  return {
    shop: toShop(data.shop, {}, ''),
    products: (data.products ?? []).map(p => ({
      productId: p.product?.id ?? '',
      name: productName(p.product),
      price: p.price ?? 0,
      status: STATUS[p.stock_status ?? 'in_stock'] ?? 'in',
    })),
  };
}

/** The nearest other shop that has the product in stock, or null. */
export async function getReferral(shopId: string, productId: string): Promise<ShopResult | null> {
  const data = await call((signal) =>
    api.GET('/search/referral', { params: { query: { shop_id: shopId, product_id: productId } }, signal }),
  );
  return data.referral ? fromResult(data.referral as ApiResult, '') : null;
}

export function alternatives(shops: ShopResult[], selected: ShopResult) {
  return shops.filter(shop => shop.id !== selected.id && shop.status === 'in' && shop.productId === selected.productId);
}

export const rupees = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value);
