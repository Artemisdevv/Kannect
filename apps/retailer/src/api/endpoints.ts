// One small function per backend call the retailer app needs. Each returns the typed data or throws
// an ApiError. Screens call these (usually through react-query), never fetch directly.
import { API_URL, ApiError, api, unwrap } from "./client";
import type { components, paths } from "./schema";
import { clearSession, getToken, setSession, setShop } from "./session";

type Body<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never;

type Json<R> = R extends { content: { "application/json": infer T } } ? T : never;
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  responses: infer R;
}
  ? R extends { 200: infer S }
    ? Json<S>
    : R extends { 201: infer S }
      ? Json<S>
      : never
  : never;

export type Product = components["schemas"]["Product"];
export type ShopProduct = components["schemas"]["ShopProduct"];

// ---------- auth ----------

export async function requestOtp(phone: string): Promise<void> {
  const r = await api.POST("/auth/otp/request", { body: { phone } });
  if (r.response.status !== 204) unwrap(r as never);
}

/** Verify the OTP as a retailer and keep the session. `shop` is null until the shop is created. */
export async function signIn(phone: string, otp: string) {
  const data = unwrap(await api.POST("/auth/otp/verify", { body: { phone, otp, role: "retailer" } }));
  setSession({ token: data.token as string, shop: (data.shop as never) ?? null });
  return data;
}

export function signOut() {
  clearSession();
}

// ---------- shop ----------

export async function getMyShop() {
  const shop = unwrap(await api.GET("/shop"));
  setShop(shop as never);
  return shop;
}

export async function createShop(body: Body<"/shop", "post">) {
  const shop = unwrap(await api.POST("/shop", { body }));
  setShop(shop as never);
  return shop;
}

export async function listShopProducts() {
  return unwrap(await api.GET("/shop/products"));
}

export async function addShopProductsBulk(body: Body<"/shop/products/bulk", "post">) {
  return unwrap(await api.POST("/shop/products/bulk", { body }));
}

export async function updateShopProduct(
  productId: string,
  body: Body<"/shop/products/{product_id}", "patch">,
) {
  return unwrap(
    await api.PATCH("/shop/products/{product_id}", { params: { path: { product_id: productId } }, body }),
  );
}

// ---------- billing and stock ----------

export async function createBill(body: Body<"/shop/bills", "post">) {
  return unwrap(await api.POST("/shop/bills", { body }));
}

export async function listBills() {
  return unwrap(await api.GET("/shop/bills"));
}

export async function recount(body: Body<"/shop/recount", "post">) {
  return unwrap(await api.POST("/shop/recount", { body }));
}

export async function recountSuggestions() {
  return unwrap(await api.GET("/shop/recount-suggestions"));
}

// ---------- catalogue ----------

/** A scanned barcode. Returns null when the catalogue does not know it (then offer createProduct). */
export async function lookupBarcode(barcode: string): Promise<Product | null> {
  const r = await api.GET("/catalogue/barcode/{barcode}", { params: { path: { barcode } } });
  if (r.response.status === 404) return null;
  return unwrap(r) as Product;
}

export async function searchCatalogue(q: string) {
  return unwrap(await api.GET("/catalogue/products", { params: { query: { q } } }));
}

export type CreateProductResult =
  | { created: true; product: Product }
  | { created: false; similar: Product[] };

/**
 * Add an unknown product to the shared catalogue. The server refuses near duplicates with a
 * `similar_product` 409 listing the existing items; show those and let the owner pick one, or call
 * again with `allowSimilar: true` to add it as a new product anyway.
 */
export async function createProduct(
  body: Body<"/catalogue/products", "post">,
  allowSimilar = false,
): Promise<CreateProductResult> {
  const r = await api.POST("/catalogue/products", { body: { ...body, allow_similar: allowSimilar } as never });
  const err = r.error as { error?: { code?: string; candidates?: Product[] } } | undefined;
  if (r.response.status === 409 && err?.error?.code === "similar_product") {
    return { created: false, similar: err.error.candidates ?? [] };
  }
  return { created: true, product: unwrap(r) as Product };
}

// ---------- AI (suggest only: the owner confirms, then call createBill / addShopProductsBulk / recount) ----------

async function postFile<T>(path: string, field: string, files: Blob[], params = ""): Promise<T> {
  const form = new FormData();
  files.forEach((f, i) => form.append(field, f, (f as File).name || `${field}${i}`));
  const token = getToken();
  const response = await fetch(`${API_URL}${path}${params}`, {
    method: "POST",
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401 && token) clearSession();
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? "internal",
      body?.error?.message ?? `Request failed (${response.status})`,
      body,
    );
  }
  return body as T;
}

/** Up to 6 shelf photos. `thorough` re-reads zoomed tiles: better, but about 30 s per photo. */
export function shelfPhoto(images: Blob[], thorough = true) {
  return postFile<Ok<"/shop/ai/shelf-photo", "post">>(
    "/shop/ai/shelf-photo",
    "images",
    images,
    `?thorough=${thorough}`,
  );
}

export function invoicePhoto(image: Blob) {
  return postFile<Ok<"/shop/ai/invoice", "post">>("/shop/ai/invoice", "image", [image]);
}

/** A recorded Malayalam/English dictation (ogg, mp3, wav, m4a or webm, up to 5 MB). */
export function voiceBill(audio: Blob) {
  // Browsers tag recordings like "audio/webm;codecs=opus"; the server picks the type from the
  // file extension, so give it a clean name.
  const ext = /ogg/.test(audio.type) ? "ogg" : /mp4|aac/.test(audio.type) ? "m4a" : /wav/.test(audio.type) ? "wav" : "webm";
  const file = audio instanceof File ? audio : new File([audio], `voice.${ext}`, { type: audio.type });
  return postFile<Ok<"/shop/ai/voice-bill", "post">>("/shop/ai/voice-bill", "audio", [file]);
}

// ---------- procurement ----------

export async function listSuppliers(q?: string) {
  return unwrap(await api.GET("/suppliers", { params: { query: q ? { q } : {} } }));
}

export async function reorderSuggestions() {
  return unwrap(await api.GET("/shop/reorder-suggestions"));
}

export async function listOrders() {
  return unwrap(await api.GET("/shop/orders", { params: { query: {} } }));
}

export async function receiveOrder(orderId: string) {
  return unwrap(
    await api.POST("/shop/orders/{order_id}/receive", { params: { path: { order_id: orderId } } }),
  );
}

export async function placeOrder(body: Body<"/shop/orders", "post">) {
  return unwrap(await api.POST("/shop/orders", { body }));
}

export async function cancelOrder(orderId: string) {
  return unwrap(
    await api.POST("/shop/orders/{order_id}/cancel", { params: { path: { order_id: orderId } } }),
  );
}
