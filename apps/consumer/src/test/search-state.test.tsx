import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { SearchResponse } from '@/lib/shopper';

vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => '/search',
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/lib/pwa', () => ({ registerAppWorker: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/shopper', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/shopper')>(), searchProducts: vi.fn(),
}));
import { searchProducts } from '@/lib/shopper';
import { ShopperShell, useShopper } from '@/components/shopper-shell';

let shopper: ReturnType<typeof useShopper>;
function Probe() {
  shopper = useShopper();
  return <output data-testid="search-state">{shopper.loading ? 'loading' : shopper.response?.shops[0]?.product ?? 'empty'}</output>;
}
function deferred() {
  let resolve: (value: SearchResponse) => void = () => {};
  const promise = new Promise<SearchResponse>(r => { resolve = r; });
  return { promise, resolve };
}
const result = (product: string): SearchResponse => ({ demo: true, shops: [{ id: 'one', name: 'Example', area: 'Edappally', address: 'Example', product, price: 1, status: 'in', coordinates: { latitude: 10, longitude: 76 }, updatedMinutes: 1 }] });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); sessionStorage.clear(); });
describe('Search state', () => {
  it('keeps the latest search when earlier results arrive last', async () => {
    const rice = deferred(), milk = deferred();
    vi.mocked(searchProducts).mockReturnValueOnce(rice.promise).mockReturnValueOnce(milk.promise);
    render(<ShopperShell><Probe /></ShopperShell>);
    act(() => { void shopper.search('rice'); });
    act(() => { void shopper.search('milk'); });
    await act(async () => { milk.resolve(result('Milk')); });
    await act(async () => { rice.resolve(result('Rice')); });
    expect(shopper.query).toBe('milk');
    expect(screen.getByTestId('search-state').textContent).toBe('Milk');
  });
  it('does not restore pending results after clearing search', async () => {
    const pending = deferred();
    vi.mocked(searchProducts).mockReturnValueOnce(pending.promise);
    render(<ShopperShell><Probe /></ShopperShell>);
    act(() => { void shopper.search('rice'); });
    act(() => shopper.resetSearch());
    await act(async () => { pending.resolve(result('Rice')); });
    expect(shopper.query).toBe('');
    expect(shopper.response).toBeNull();
    expect(shopper.loading).toBe(false);
  });
  it('gives immediate loading feedback and cancels typing searches on reset', async () => {
    vi.useFakeTimers();
    render(<ShopperShell><Probe /></ShopperShell>);
    act(() => shopper.setQuery('flour'));
    expect(shopper.query).toBe('flour');
    expect(shopper.loading).toBe(true);
    act(() => shopper.resetSearch());
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(searchProducts).not.toHaveBeenCalled();
    expect(shopper.query).toBe('');
    expect(shopper.loading).toBe(false);
  });
});