import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  createBill,
  createProduct,
  lookupBarcode,
  recount,
  shelfPhoto,
  signIn,
} from "./endpoints";
import { normalizeBarcode } from "./scan";
import { clearSession, getShop, getToken, resetSessionCache, setSession } from "./session";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
const lastRequest = () => fetchMock.mock.calls.at(-1)![0] as Request;

beforeEach(() => {
  window.localStorage.clear();
  resetSessionCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("session", () => {
  it("signIn stores the token and shop, and later calls send the token", async () => {
    fetchMock.mockResolvedValueOnce(json({ token: "tok123", role: "retailer", shop: null }));
    await signIn("+919000000002", "123456");
    expect(getToken()).toBe("tok123");
    expect(getShop()).toBeNull();

    fetchMock.mockResolvedValueOnce(json({ items: [] }));
    await createBill({
      client_id: "11111111-1111-1111-1111-111111111111",
      payment_mode: "cash",
      items: [{ product_id: "p1", quantity: 2 }],
    } as never);
    expect(lastRequest().headers.get("Authorization")).toBe("Bearer tok123");
  });

  it("survives a reload through localStorage", () => {
    setSession({ token: "abc", shop: null });
    resetSessionCache();
    expect(getToken()).toBe("abc");
  });

  it("a 401 clears the session", async () => {
    setSession({ token: "stale", shop: null });
    fetchMock.mockResolvedValueOnce(json({ error: { code: "unauthorized", message: "no" } }, 401));
    await expect(recount({ items: [] } as never)).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBeNull();
  });
});

describe("errors", () => {
  it("turns the API error body into an ApiError", async () => {
    setSession({ token: "t", shop: null });
    fetchMock.mockResolvedValueOnce(json({ error: { code: "conflict", message: "Barcode exists" } }, 409));
    const err = await createBill({} as never).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "conflict", message: "Barcode exists" });
  });
});

describe("catalogue", () => {
  it("lookupBarcode returns null when the catalogue does not know the code", async () => {
    setSession({ token: "t", shop: null });
    fetchMock.mockResolvedValueOnce(json({ error: { code: "not_found", message: "x" } }, 404));
    expect(await lookupBarcode("8901023010484")).toBeNull();
  });

  it("createProduct reports a near duplicate instead of throwing", async () => {
    setSession({ token: "t", shop: null });
    const existing = { id: "p9", name: "Cinthol soap" };
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: "similar_product", message: "x", candidates: [existing] } }, 409),
    );
    const result = await createProduct({ name: "Cinthol Soap", unit: "piece" } as never);
    expect(result).toEqual({ created: false, similar: [existing] });
  });

  it("createProduct can force-create with allowSimilar", async () => {
    setSession({ token: "t", shop: null });
    fetchMock.mockResolvedValueOnce(json({ id: "new", name: "X" }, 201));
    const result = await createProduct({ name: "X", unit: "piece" } as never, true);
    expect(result.created).toBe(true);
    const body = JSON.parse(await lastRequest().text());
    expect(body.allow_similar).toBe(true);
  });
});

describe("uploads", () => {
  it("shelfPhoto posts multipart with the token and thorough flag", async () => {
    setSession({ token: "t", shop: null });
    fetchMock.mockResolvedValueOnce(json({ detections: [], image_quality: "good" }));
    await shelfPhoto([new Blob(["x"], { type: "image/jpeg" })], false);
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(String(url)).toContain("/shop/ai/shelf-photo?thorough=false");
    expect(init.headers.Authorization).toBe("Bearer t");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("an upload error becomes an ApiError", async () => {
    setSession({ token: "t", shop: null });
    fetchMock.mockResolvedValueOnce(json({ error: { code: "invalid_request", message: "bad" } }, 400));
    await expect(shelfPhoto([new Blob(["x"])])).rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("normalizeBarcode", () => {
  it.each([
    ["8901023010484", "8901023010484"],
    [" 8901023010484 ", "8901023010484"],
    ["12345", null],
    ["abc123456", null],
    ["123456789012345", null],
  ])("%s", (raw, expected) => expect(normalizeBarcode(raw)).toBe(expected));
});

it("clearSession empties storage", () => {
  setSession({ token: "t", shop: null });
  clearSession();
  expect(window.localStorage.getItem("kannect.retailer.token")).toBeNull();
});
