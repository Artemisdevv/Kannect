import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePhone, tidy } from '@/lib/phone';
import { cancelReservation, createReservation, fetchReservation, forgetReservations, saveReservation, savedReservation, savedReservations } from '@/lib/reservations';
import { statusMessage } from '@/lib/reservation-text';
import { lineTotal, qtyLabel } from '@/components/reserve-dialog';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;
const lastRequest = () => fetchMock.mock.calls.at(-1)![0] as Request;
beforeEach(() => { window.localStorage.clear(); fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('parsePhone', () => {
  it.each([['98765 43210', '+919876543210'], ['+91 98765-43210', '+919876543210'], ['919876543210', '+919876543210'], ['09876543210', '+919876543210']])('accepts %s', (input, phone) => expect(parsePhone(input).phone).toBe(phone));
  it.each([['', '10 digits'], ['12345', '10 digits'], ['5876543210', 'start with'], ['98765abcde', 'digits only']])('rejects %s', (input, hint) => expect(parsePhone(input).error).toContain(hint));
  it('tidy collapses spaces', () => expect(tidy('  Asha   K ')).toBe('Asha K'));
});

describe('reservation requests', () => {
  it('sends the request body and returns the token once', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'r1', status: 'requested', access_token: 'tok-0123456789abcdef' }, 201));
    const res = await createReservation({ clientId: 'c1', shopId: 's1', name: 'Asha', phone: '+919876543210', items: [{ productId: 'p1', quantity: 3 }] });
    expect(res.access_token).toBe('tok-0123456789abcdef');
    const request = lastRequest();
    expect(request.method).toBe('POST');
    expect(await request.json()).toEqual({ client_id: 'c1', shop_id: 's1', customer_name: 'Asha', customer_phone: '+919876543210', items: [{ product_id: 'p1', quantity: 3 }] });
  });

  it('shows the shop’s "only N available" message', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'conflict', message: 'Biscuit: only 7 available' } }, 409));
    await expect(createReservation({ clientId: 'c', shopId: 's', name: 'Asha', phone: '+919876543210', items: [{ productId: 'p', quantity: 9 }] })).rejects.toThrow('only 7 available');
  });

  it('keeps the secret token in a header, never in the URL', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'r1', status: 'accepted' }));
    await fetchReservation('r1', 'secret-token-123456');
    expect(lastRequest().headers.get('X-Reservation-Token')).toBe('secret-token-123456');
    expect(lastRequest().url).not.toContain('secret-token');
    fetchMock.mockResolvedValueOnce(json({ id: 'r1', status: 'cancelled' }));
    await cancelReservation('r1', 'secret-token-123456');
    expect(lastRequest().headers.get('X-Reservation-Token')).toBe('secret-token-123456');
    expect(lastRequest().url).not.toContain('secret-token');
  });
});

describe('what this phone remembers', () => {
  it('lists newest first without duplicates and finds one by id', () => {
    saveReservation({ id: 'a', token: 't-a', shopName: 'A', at: 1 });
    saveReservation({ id: 'b', token: 't-b', shopName: 'B', at: 2 });
    saveReservation({ id: 'a', token: 't-a2', shopName: 'A', at: 3 });
    expect(savedReservations().map(r => r.id)).toEqual(['a', 'b']);
    expect(savedReservation('a')?.token).toBe('t-a2');
    expect(savedReservation('zzz')).toBeUndefined();
    forgetReservations();
    expect(savedReservations()).toEqual([]);
  });
});

describe('text and totals', () => {
  it('prices loose goods per kg', () => {
    expect(lineTotal({ productId: 'p', name: 'Tomato', unit: 'gram', price: 40, quantity: 500 })).toBe(20);
    expect(lineTotal({ productId: 'p', name: 'Soap', unit: 'piece', price: 45, quantity: 3 })).toBe(135);
    expect(qtyLabel(1500, 'gram')).toBe('1.5 kg');
    expect(qtyLabel(250, 'gram')).toBe('250 g');
  });
  it('explains each state in plain words', () => {
    expect(statusMessage({ status: 'requested', shop: { name: 'Mary' } })).toContain('Mary has your request');
    expect(statusMessage({ status: 'declined', decline_reason: 'Sold out', shop: { name: 'Mary' } })).toContain('Sold out');
    expect(statusMessage({ status: 'cancelled' })).toContain('cancelled');
  });
});
