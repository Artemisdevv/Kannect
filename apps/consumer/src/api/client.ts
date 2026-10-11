// Typed client for the public (no sign-in) endpoints the shopper app uses. Types are generated from
// docs/openapi.yaml with `bun run gen:api`.
import createClient from "openapi-fetch";

import type { paths } from "./schema";

export const API_URL: string = (
  import.meta.env["VITE_API_URL"] ?? "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

export const api = createClient<paths>({
  baseUrl: API_URL,
  fetch: (request) => globalThis.fetch(request), // looked up per call so tests can stub it
});

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Run a call with a timeout and turn failures into a readable error. */
export async function call<T>(
  run: (signal: AbortSignal) => Promise<{ data?: T; error?: unknown; response: Response }>,
  timeoutMs = 12_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await run(controller.signal);
    if (r.data !== undefined && !r.error) return r.data;
    const body = r.error as { error?: { message?: string } } | undefined;
    throw new ApiError(r.response.status, body?.error?.message ?? `Request failed (${r.response.status})`);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") throw new Error("The server is taking too long. Try again.");
    throw new Error("Couldn’t reach Kannect. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}
