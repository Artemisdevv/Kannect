import { demoHandle } from "./demo";
import type { Session } from "./types";

export type ApiErrorKind =
  | "network"
  | "timeout"
  | "validation"
  | "conflict"
  | "unauthorized"
  | "not_found"
  | "server";

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "");
export const IS_DEMO = !API_URL;

const SESSION_KEY = "kn_supplier_session";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function writeSession(s: Session | null) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

const TIMEOUT_MS = 15000;

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiError("network", "You're offline. Check your connection and try again.");
  }
  if (IS_DEMO) return demoHandle<T>(method, path, body);

  const session = readSession();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError")
      throw new ApiError("timeout", "The server took too long to respond. Try again.");
    throw new ApiError("network", "Couldn't reach the server. Check your connection.");
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => undefined);
  if (res.ok) return data as T;
  const msg = (data && (data.message || data.error)) || `Request failed (${res.status})`;
  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError("unauthorized", "Your session has expired. Please sign in again.", 401);
  }
  if (res.status === 404) throw new ApiError("not_found", msg, 404);
  if (res.status === 409)
    throw new ApiError("conflict", msg || "This was already changed. Refresh to see the latest.", 409);
  if (res.status === 400 || res.status === 422)
    throw new ApiError("validation", msg, res.status, data?.fieldErrors ?? data?.errors);
  throw new ApiError("server", msg, res.status);
}
