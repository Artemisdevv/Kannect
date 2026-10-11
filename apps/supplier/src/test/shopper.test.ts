import { describe, expect, it } from 'vitest';
import { alternatives, demoSearch, exampleShops, nearbyShops, sortNearby } from '@/lib/shopper';
describe('Shopper rules', () => {
  it.each([
    ['rice', 'Jaya Rice · 5 kg'], ['flour', 'Wheat Flour · 1 kg'],
    ['oil', 'Coconut Oil · 500 ml'], ['spices', 'Mixed Spices · 100 g'],
    ['lentils', 'Red Lentils · 1 kg'], ['milk', 'Fresh Milk · 500 ml'],
    ['bread', 'Fresh Bread · 400 g'], ['sugar', 'Sugar · 1 kg'], ['tea', 'Tea · 250 g'],
  ])('searches the requested catalogue item %s', (query, product) => {
    expect(demoSearch(query, 'Edappally').shops.map(s => s.product)).toEqual([product, product, product]);
  });
  it('matches partially typed catalogue names', () => {
    expect(demoSearch('flo', 'Edappally').shops[0]?.product).toBe('Wheat Flour · 1 kg');
  });
  it('discovers stores by area without requiring a product query', () => {
    expect(nearbyShops('Edappally').map(s => s.id)).toEqual(['green-basket', 'udayam', 'family']);
    expect(nearbyShops('Kakkanad').map(s => s.id)).toEqual(['daily']);
  });
  it('sorts by distance only with valid shopper coordinates', () => {
    const shops = sortNearby(exampleShops, { latitude: 10.0254, longitude: 76.3083 });
    expect(shops[0]?.id).toBe('green-basket');
    expect(shops[0]?.distanceKm).toBe(0);
    expect(shops.map(s => s.distanceKm)).toEqual(shops.map(s => s.distanceKm).sort((a, b) => (a ?? 0) - (b ?? 0)));
  });
  it('does not imply exact distances without valid coordinates', () => {
    expect(sortNearby(exampleShops, { latitude: NaN, longitude: 76 })[0]?.distanceKm).toBeUndefined();
    expect(sortNearby(exampleShops).map(s => s.id)).toEqual(exampleShops.map(s => s.id));
  });
  it('refers an out-of-stock product only to in-stock same-product results', () => {
    const result = demoSearch('rice', 'Edappally');
    const out = result.shops.find(s => s.status === 'out');
    if (!out) throw new Error('Expected an out-of-stock fixture');
    expect(alternatives(result.shops, out).map(s => s.id)).toEqual(['green-basket']);
  });
  it('never fabricates alternatives when none are returned', () => {
    const out = exampleShops[2];
    if (!out) throw new Error('Missing fixture');
    expect(alternatives([out], out)).toEqual([]);
  });
  it('marks demo availability explicitly', () => { expect(demoSearch('rice', 'Edappally').demo).toBe(true); });
  it('limits area-based results to the selected area', () => { expect(demoSearch('rice', 'Kakkanad').shops.map(s => s.id)).toEqual(['daily']); });
  it('returns no products for empty or unknown searches', () => { expect(demoSearch('', 'Edappally').shops).toEqual([]); expect(demoSearch('unknown', 'Edappally').shops).toEqual([]); });
  it('does not expose private retailer fields', () => {
    const shop = demoSearch('rice', 'Edappally').shops[0];
    if (!shop) throw new Error('Missing fixture');
    const keys = Object.keys(shop);
    expect(keys).toEqual(['id', 'name', 'area', 'address', 'product', 'price', 'status', 'coordinates', 'updatedMinutes']);
  });
});