// Typed API client, generated types come from docs/openapi.yaml (`bun run gen:api`).
import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "./schema";
import { clearSession, getToken } from "./session";

export const API_URL: string = (
  import.meta.env["VITE_API_URL"] ?? "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

/** The `{ error: { code, message } }` body every failing endpoint returns. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

const auth: Middleware = {
  onRequest({ request }) {
    const token = getToken();
    if (token && !request.headers.has("Authorization")) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
  onResponse({ response }) {
    // An expired or invalid token: forget it so the app shows the login screen.
    if (response.status === 401 && getToken()) clearSession();
    return response;
  },
};

export const api = createClient<paths>({
  baseUrl: API_URL,
  fetch: (request) => globalThis.fetch(request), // looked up per call so tests can stub it
});
api.use(auth);

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Unwrap an openapi-fetch result: return the data or throw an ApiError. */
export function unwrap<T>(result: Result<T>): T {
  if (result.data !== undefined && !result.error) return result.data;
  const body = result.error as { error?: { code?: string; message?: string } } | undefined;
  const status = result.response.status;
  // Validation failures from the server come back as 400 invalid_request with the details as text.
  throw new ApiError(
    status,
    body?.error?.code ?? "internal",
    body?.error?.message ?? `Request failed (${status})`,
    result.error,
  );
}
