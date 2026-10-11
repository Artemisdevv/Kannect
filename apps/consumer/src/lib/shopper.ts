export type StockStatus = 'in' | 'low' | 'out';
export type Coordinates = { latitude: number; longitude: number };
export type ShopResult = {
  id: string; name: string; area: string; address: string;
  product: string; price: number; status: StockStatus;
  coordinates: Coordinates; updatedMinutes: number;
  distanceKm?: number;
};
export type SearchResponse = { shops: ShopResult[]; demo: boolean; cachedAt?: number };
export const areas = ['Edappally', 'Kakkanad', 'Palarivattom'] as const;
export const exampleShops: ShopResult[] = [
  { id: 'green-basket', name: 'Green Basket Stores', area: 'Edappally', address: 'Market Road, Edappally, Kochi', product: 'Jaya Rice · 5 kg', price: 380, status: 'in', coordinates: { latitude: 10.0254, longitude: 76.3083 }, updatedMinutes: 8 },
  { id: 'udayam', name: 'Udayam Supermarket', area: 'Edappally', address: 'Ponekkara Road, Edappally, Kochi', product: 'Jaya Rice · 5 kg', price: 395, status: 'low', coordinates: { latitude: 10.0323, longitude: 76.3005 }, updatedMinutes: 15 },
  { id: 'family', name: 'Family Mart', area: 'Edappally', address: 'Changampuzha Park Road, Edappally, Kochi', product: 'Jaya Rice · 5 kg', price: 385, status: 'out', coordinates: { latitude: 10.018, longitude: 76.303 }, updatedMinutes: 24 },
  { id: 'daily', name: 'Daily Fresh', area: 'Kakkanad', address: 'Civil Station Road, Kakkanad, Kochi', product: 'Jaya Rice · 5 kg', price: 390, status: 'in', coordinates: { latitude: 10.015, longitude: 76.342 }, updatedMinutes: 12 },
  { id: 'corner', name: 'The Corner Shop', area: 'Palarivattom', address: 'Janatha Junction, Palarivattom, Kochi', product: 'Jaya Rice · 5 kg', price: 380, status: 'in', coordinates: { latitude: 10.002, longitude: 76.312 }, updatedMinutes: 18 },
];
const products = [
  { names: ['rice', 'jaya', 'ari', 'അരി', '8901234567890'], product: 'Jaya Rice · 5 kg', price: 380 },
  { names: ['milk', 'paal', 'പാൽ', 'dairy'], product: 'Fresh Milk · 500 ml', price: 28 },
  { names: ['tomato', 'vegetable', 'തക്കാളി'], product: 'Fresh Tomatoes · 1 kg', price: 40 },
  { names: ['banana', 'fruit', 'പഴം'], product: 'Robusta Bananas · 1 kg', price: 55 },
  { names: ['egg', 'eggs', 'മുട്ട'], product: 'Farm Eggs · 6 pieces', price: 48 },
  { names: ['oil', 'coconut'], product: 'Coconut Oil · 500 ml', price: 160 },
  { names: ['flour', 'atta'], product: 'Wheat Flour · 1 kg', price: 55 },
  { names: ['spices', 'spice', 'masala'], product: 'Mixed Spices · 100 g', price: 65 },
  { names: ['lentils', 'lentil', 'dal'], product: 'Red Lentils · 1 kg', price: 120 },
  { names: ['bread', 'loaf'], product: 'Fresh Bread · 400 g', price: 45 },
  { names: ['sugar'], product: 'Sugar · 1 kg', price: 48 },
  { names: ['tea'], product: 'Tea · 250 g', price: 110 },
];
export function distanceKm(a: Coordinates, b: Coordinates) {
  const rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function validCoordinates(c?: Coordinates): c is Coordinates {
  return !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;
}
export function sortNearby(shops: ShopResult[], coordinates?: Coordinates): ShopResult[] {
  if (!validCoordinates(coordinates)) return shops.map(({ distanceKm: _distance, ...shop }) => shop);
  return shops.map(shop => ({ ...shop, distanceKm: distanceKm(coordinates, shop.coordinates) })).sort((a, b) => a.distanceKm - b.distanceKm);
}
export function alternatives(shops: ShopResult[], selected: ShopResult) {
  return shops.filter(shop => shop.id !== selected.id && shop.status === 'in' && shop.product === selected.product);
}
export function nearbyShops(area: string, coordinates?: Coordinates) {
  return sortNearby(exampleShops.filter(shop => validCoordinates(coordinates)
    ? distanceKm(coordinates, shop.coordinates) <= 15 : shop.area === area), coordinates);
}
export function demoSearch(query: string, area: string, coordinates?: Coordinates): SearchResponse {
  const q = query.trim().toLowerCase();
   const found = q ? products.find(p => p.names.some(name => q.includes(name) || name.startsWith(q))) : undefined;
  if (!found) return { shops: [], demo: true };
  const shops = exampleShops.filter(s => validCoordinates(coordinates) ? distanceKm(coordinates, s.coordinates) <= 15 : s.area === area)
    .map((s, i) => ({ ...s, product: found.product, price: found.price + (i === 1 ? (found.price > 100 ? 15 : 2) : 0) }));
  return { shops: sortNearby(shops, coordinates), demo: true };
}
// Integration boundary: no endpoint is invented. Supply the current OpenAPI
// contract before implementing a real VITE_API_URL transport.
export async function searchProducts(query: string, area: string, coordinates?: Coordinates): Promise<SearchResponse> {
  if (import.meta.env['VITE_API_URL']) throw new Error('The live catalogue contract has not been connected yet.');
  await new Promise(resolve => setTimeout(resolve, 450));
  return demoSearch(query, area, coordinates);
}
export const rupees = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);