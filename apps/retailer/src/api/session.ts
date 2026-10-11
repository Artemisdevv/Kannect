// Auth token and signed-in shop, kept in memory and mirrored to localStorage when it is allowed
// (private windows and blocked site data can throw, so every access is guarded).
import type { components } from "./schema";

export type Shop = components["schemas"]["Shop"];

const TOKEN_KEY = "kannect.retailer.token";
const SHOP_KEY = "kannect.retailer.shop";

let token: string | null = null;
let shop: Shop | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the in-memory copy still works for this tab */
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  token = read(TOKEN_KEY);
  try {
    const raw = read(SHOP_KEY);
    shop = raw ? (JSON.parse(raw) as Shop) : null;
  } catch {
    shop = null;
  }
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function getToken(): string | null {
  load();
  return token;
}

export function getShop(): Shop | null {
  load();
  return shop;
}

export function isSignedIn(): boolean {
  return getToken() !== null;
}

export function setSession(next: { token: string; shop: Shop | null }) {
  load();
  token = next.token;
  shop = next.shop;
  write(TOKEN_KEY, token);
  write(SHOP_KEY, shop ? JSON.stringify(shop) : null);
  notify();
}

export function setShop(next: Shop | null) {
  load();
  shop = next;
  write(SHOP_KEY, next ? JSON.stringify(next) : null);
  notify();
}

export function clearSession() {
  load();
  token = null;
  shop = null;
  write(TOKEN_KEY, null);
  write(SHOP_KEY, null);
  notify();
}

/** For useSyncExternalStore: re-render when the session changes. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test helper: forget the cached state so the next read goes back to storage. */
export function resetSessionCache() {
  token = null;
  shop = null;
  loaded = false;
}
