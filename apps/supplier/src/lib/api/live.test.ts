import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const order = (id: string, status: string) => ({ id, status, total: 100, shop: { name: "S", address: "A" }, items: [], tracking: [], created_at: "2026-10-12T05:00:00Z" });

beforeEach(() => { vi.resetModules(); vi.stubEnv("VITE_API_URL", "http://api.test/api/v1"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("liveApi", () => {
  it("signs in as a supplier and keeps the typed phone", async () => {
    const f = vi.fn().mockResolvedValue(json({ token: "t", role: "supplier", shop: null, supplier: null }));
    vi.stubGlobal("fetch", f);
    const { liveApi } = await import("./live");
    expect(await liveApi.verifyOtp("+919000000001", "123456")).toEqual({ token: "t", role: "supplier", phone: "+919000000001" });
    const sent = f.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(sent.body))).toEqual({ phone: "+919000000001", otp: "123456", role: "supplier" });
  });

  it("requesting a code resolves even though the API answers 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { liveApi } = await import("./live");
    await expect(liveApi.requestOtp("+919000000001")).resolves.toEqual({ sent: true });
  });

  it("lists invoices only for accepted orders and survives one failing invoice", async () => {
    const f = vi.fn(async (req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.endsWith("/supplier/orders")) return json({ items: [order("o1", "accepted"), order("o2", "placed"), order("o3", "delivered")] });
      if (url.endsWith("/supplier/orders/o1/invoice")) return json({ number: "INV-1", order_id: "o1", subtotal: 100, gst: 0, total: 100, status: "unpaid" });
      if (url.endsWith("/supplier/orders/o3/invoice")) return json({ error: { message: "boom" } }, 500);
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", f);
    const { liveApi } = await import("./live");
    const list = await liveApi.listInvoices();
    expect(list.map((i) => i.number)).toEqual(["INV-1"]);
  });
});
