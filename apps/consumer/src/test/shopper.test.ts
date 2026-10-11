import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alternatives, getReferral, getShopPage, nearbyShops, resultMapShops, searchProducts, type ShopResult } from '@/lib/shopper';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;
const lastUrl = () => new URL((fetchMock.mock.calls.at(-1)![0] as Request).url);

beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

const shop = { id: 's1', name: 'Sreeram Stores', address: 'Kaloor', phone: '+919000000001', location: { lat: 9.99, lng: 76.3 } };

describe('searchProducts', () => {
  it('searches around the chosen area and maps the API result', async () => {
    fetchMock.mockResolvedValueOnce(json({ results: [
      { shop, product: { id: 'p1', brand: 'Godrej', name: 'Cinthol soap', size: '100g' }, price: 45, stock_status: 'out', distance_m: 141 },
      { shop: { ...shop, id: 's2', name: 'Mary Matha' }, product: { id: 'p1', brand: 'Godrej', name: 'Cinthol soap', size: '100g' }, price: 45, stock_status: 'in_stock', distance_m: 276 },
    ] }));
    const out = await searchProducts('  soap ', 'Kaloor');
    const url = lastUrl();
    expect(url.pathname).toBe('/api/v1/search');
    expect(url.searchParams.get('q')).toBe('soap');
    expect(url.searchParams.get('area')).toBe('Kaloor');
    expect(url.searchParams.has('lat')).toBe(false);
    expect(url.searchParams.get('include_out')).toBe('true');
    expect(out.shops.map(s => [s.name, s.status, s.distanceKm, s.product])).toEqual([
      ['Sreeram Stores', 'out', 0.141, 'Godrej Cinthol soap 100g'],
      ['Mary Matha', 'in', 0.276, 'Godrej Cinthol soap 100g'],
    ]);
    expect(new Set(out.shops.map(s => s.uid)).size).toBe(2);
  });

  it("uses the shopper's own location when shared", async () => {
    fetchMock.mockResolvedValueOnce(json({ results: [] }));
    await searchProducts('rice', 'Your location', { latitude: 10.1, longitude: 76.4 });
    expect(lastUrl().searchParams.get('lat')).toBe('10.1');
    expect(lastUrl().searchParams.get('lng')).toBe('76.4');
  });

  it('shows the server error message', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'invalid_request', message: 'q must contain a word' } }, 400));
    await expect(searchProducts('!!', 'Kaloor')).rejects.toThrow('q must contain a word');
  });

  it('turns a network failure into a readable error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(searchProducts('rice', 'Kaloor')).rejects.toThrow(/reach Kannect/);
  });
});

describe('browsing and shop page', () => {
  it('lists nearby shops with distance', async () => {
    fetchMock.mockResolvedValueOnce(json({ shops: [{ shop, distance_m: null }] }));
    const list = await nearbyShops('Edappally');
    expect(lastUrl().pathname).toBe('/api/v1/shops/nearby');
    expect(lastUrl().searchParams.get('area')).toBe('Edappally');
    expect(list[0]).toMatchObject({ id: 's1', name: 'Sreeram Stores', coordinates: { latitude: 9.99, longitude: 76.3 } });
    expect(list[0]?.distanceKm).toBeUndefined();
  });

  it('loads a shop page with status and how many can be reserved', async () => {
    fetchMock.mockResolvedValueOnce(json({ shop, products: [
      { product: { id: 'p1', name: 'Tomato' }, price: 40, stock_status: 'low', reservable: 6 },
      { product: { id: 'p2', name: 'Rice' }, price: 60, stock_status: 'in_stock' },
    ] }));
    const page = await getShopPage('s1');
    expect(page.shop.name).toBe('Sreeram Stores');
    expect(page.products).toEqual([
      { productId: 'p1', name: 'Tomato', unit: 'piece', price: 40, status: 'low', reservable: 6 },
      { productId: 'p2', name: 'Rice', unit: 'piece', price: 60, status: 'in', reservable: null }, // older server: no count
    ]);
  });

  it('referral is null when nobody nearby has it', async () => {
    fetchMock.mockResolvedValueOnce(json({ referral: null }));
    expect(await getReferral('s1', 'p1')).toBeNull();
    expect(lastUrl().searchParams.get('shop_id')).toBe('s1');
  });
});

describe('helpers', () => {
  it('groups product results into one real shop marker without losing stock statuses', () => {
    const base: ShopResult = {
      id: 's1', uid: 's1:p1', name: 'Store', area: 'Kaloor', address: 'Kaloor Road', product: 'Soap', productId: 'p1',
      price: 40, status: 'out', coordinates: { latitude: 9.99, longitude: 76.3 },
    };
    const markers = resultMapShops([base, { ...base, uid: 's1:p2', productId: 'p2', status: 'low' }]);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.statuses).toEqual(['out', 'low']);
    expect(markers[0]?.coordinates).toEqual(base.coordinates);
  });

  it('sends actual shopper coordinates and rejects unavailable location without an area fallback', async () => {
    fetchMock.mockResolvedValueOnce(json({ shops: [] }));
    await nearbyShops('Your location', { latitude: 10.1, longitude: 76.4 });
    expect(lastUrl().searchParams.get('lat')).toBe('10.1');
    expect(lastUrl().searchParams.get('lng')).toBe('76.4');
    await expect(nearbyShops('Your location')).rejects.toThrow('Choose an area');
  });

  it('alternatives are other shops with the same product in stock', () => {
    const mk = (id: string, status: ShopResult['status'], productId = 'p1'): ShopResult => ({
      id, uid: `${id}:${productId}`, name: id, area: '', address: '', product: 'x', productId, price: 1, status,
      coordinates: { latitude: 0, longitude: 0 },
    });
    const list = [mk('a', 'out'), mk('b', 'in'), mk('c', 'low'), mk('d', 'in', 'p2')];
    expect(alternatives(list, list[0]!).map(s => s.id)).toEqual(['b']);
  });
});
