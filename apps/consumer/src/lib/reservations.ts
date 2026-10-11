// Reserve for pickup: the shopper asks one shop to set items aside. No account and no payment; the
// device keeps a secret token per request (sent as a header, never in the URL) to read or cancel it.
import { api, call } from '@/api/client';
import type { components } from '@/api/schema';

export type Reservation = components['schemas']['Reservation'];
export type ReservationStatus = NonNullable<Reservation['status']>;

export type ReserveInput = {
  clientId: string;
  shopId: string;
  name: string;
  phone: string;
  note?: string;
  items: { productId: string; quantity: number }[];
};

export const createReservation = (input: ReserveInput) =>
  call((signal) =>
    api.POST('/reservations', {
      body: {
        client_id: input.clientId,
        shop_id: input.shopId,
        customer_name: input.name,
        customer_phone: input.phone,
        ...(input.note ? { note: input.note } : {}),
        items: input.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
      },
      signal,
    }),
  );

export const fetchReservation = (id: string, token: string) =>
  call((signal) =>
    api.GET('/reservations/{reservation_id}', {
      params: { path: { reservation_id: id }, header: { 'X-Reservation-Token': token } },
      signal,
    }),
  );

export const cancelReservation = (id: string, token: string) =>
  call((signal) =>
    api.POST('/reservations/{reservation_id}/cancel', {
      params: { path: { reservation_id: id }, header: { 'X-Reservation-Token': token } },
      signal,
    }),
  );

export const isOpen = (status?: string) => status === 'requested' || status === 'accepted';

// ---- what this phone remembers (storage can be unavailable: private windows, blocked site data)

export type SavedReservation = { id: string; token: string; shopName: string; at: number };
const LIST_KEY = 'kannect:reservations';
const CONTACT_KEY = 'kannect:contact';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* the request still exists on the server; it just will not be listed on this phone */
  }
}

export const savedReservations = (): SavedReservation[] => read<SavedReservation[]>(LIST_KEY, []);
export const savedReservation = (id: string) => savedReservations().find((r) => r.id === id);
export function saveReservation(entry: SavedReservation) {
  write(LIST_KEY, [entry, ...savedReservations().filter((r) => r.id !== entry.id)].slice(0, 30));
}
export const savedContact = () => read<{ name: string; phone: string }>(CONTACT_KEY, { name: '', phone: '' });
export const saveContact = (contact: { name: string; phone: string }) => write(CONTACT_KEY, contact);
export function forgetReservations() {
  try {
    window.localStorage.removeItem(LIST_KEY);
  } catch {
    /* nothing to forget */
  }
}
