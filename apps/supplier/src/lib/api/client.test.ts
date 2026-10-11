import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_API_URL", "http://api.test/api/v1");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("request (live)", () => {
  it("shows the server message for an API error object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "conflict", message: "Order is below the supplier minimum" } }, 409)));
    const { request } = await import("./client");
    await expect(request("POST", "/x", {})).rejects.toMatchObject({ kind: "conflict", message: "Order is below the supplier minimum" });
  });

  it("a wrong code is a validation error, not an expired session", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "unauthorized", message: "Invalid phone or OTP" } }, 401)));
    const { request, setUnauthorizedHandler } = await import("./client");
    setUnauthorizedHandler(onUnauthorized);
    await expect(request("POST", "/auth/otp/verify", {})).rejects.toMatchObject({ kind: "validation", message: "Invalid phone or OTP" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("a 401 elsewhere signs the supplier out", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "x" } }, 401)));
    const { request, setUnauthorizedHandler } = await import("./client");
    setUnauthorizedHandler(onUnauthorized);
    await expect(request("GET", "/supplier", undefined)).rejects.toMatchObject({ kind: "unauthorized" });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it("a 204 returns undefined", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { request } = await import("./client");
    await expect(request("POST", "/auth/otp/request", { phone: "+919000000000" })).resolves.toBeUndefined();
  });
});
