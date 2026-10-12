import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render as plainRender, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  bill: { total: 20, share_url: "https://kannect.test/b/abc" } as Record<string, unknown>,
  exportCsv: vi.fn(),
  saved: [] as { name: string; type: string; title?: string }[],
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
const shop = vi.hoisted(() => ({ name: "Sreeram Stores", address: "Kaloor", shop_type: "grocery" }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => async () => {},
}));
vi.mock("@/api", () => ({
  ApiError: class ApiError extends Error {},
  getShop: () => shop,
  subscribe: () => () => {},
  signOut: () => {},
  getScanner: () => ({ kind: "native", scanOnce: async () => null, start: async () => () => {} }),
  normalizeBarcode: (s: string) => s,
  lookupBarcode: async () => null,
  createProduct: async () => ({}),
  voiceBill: async () => ({ transcript: "", suggestions: [] }),
  exportShopCsv: () => state.exportCsv(),
}));
vi.mock("@/lib/save-file", () => ({
  saveFile: async (name: string, blob: Blob, title?: string) => {
    state.saved.push({ name, type: blob.type, ...(title ? { title } : {}) });
  },
}));
vi.mock("@/features/queries", () => ({
  useShopProducts: () => ({
    data: [{ product: { id: "p1", name: "Soap", unit: "piece" }, price: 20, stock_qty: 5, stock_status: "in_stock" }],
    isLoading: false,
    isError: false,
  }),
  useCreateBill: () => ({ isPending: false, mutateAsync: async () => state.bill }),
  useBills: () => ({ data: [] }),
  usePickups: () => ({ data: [] }),
  useRecount: () => ({ isPending: false, mutateAsync: async () => ({}) }),
  useAddProductsBulk: () => ({ isPending: false, mutateAsync: async () => ({}) }),
}));

import { BillingPage } from "@/features/billing/billing-page";
import { MorePage } from "@/features/home/more-page";
import { setLocale } from "@/lib/i18n";

const render = (node: ReactNode) =>
  plainRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);

beforeEach(() => {
  window.localStorage.clear();
  setLocale("en");
  state.bill = { total: 20, share_url: "https://kannect.test/b/abc" };
  state.exportCsv = vi.fn().mockResolvedValue(new Blob(["a,b"], { type: "text/csv" }));
  state.saved = [];
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(cleanup);

async function saveABill() {
  render(<BillingPage />);
  fireEvent.click(screen.getByRole("button", { name: "Add Soap" }));
  fireEvent.click(screen.getByRole("button", { name: /Review bill/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm bill" }));
  await screen.findByText("Bill saved");
}

describe("sending a saved bill on WhatsApp", () => {
  it("offers a WhatsApp link carrying the shop, the amount and the e-bill link", async () => {
    await saveABill();
    const link = screen.getByRole("link", { name: /WhatsApp/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    const url = new URL(link.getAttribute("href")!);
    expect(url.origin + url.pathname).toBe("https://wa.me/");
    const text = url.searchParams.get("text")!;
    expect(text).toContain("Sreeram Stores");
    expect(text).toContain("₹20");
    expect(text).toContain("https://kannect.test/b/abc");
  });

  it("is written in Malayalam when the language is Malayalam", async () => {
    setLocale("ml");
    render(<BillingPage />);
    fireEvent.click(screen.getByRole("button", { name: /ചേർക്കുക/ }));
    fireEvent.click(screen.getByRole("button", { name: /ബിൽ പരിശോധിക്കുക/ }));
    fireEvent.click(await screen.findByRole("button", { name: /ബിൽ സ്ഥിരീകരിക്കുക/ }));
    const link = await screen.findByRole("link", { name: /വാട്സ്ആപ്പ/ });
    const text = new URL(link.getAttribute("href")!).searchParams.get("text")!;
    expect(text).toMatch(/[ഀ-ൿ]/);
  });

  it("has no WhatsApp button when the bill came back without a link", async () => {
    state.bill = { total: 20 };
    await saveABill();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
  });
});

describe("exporting the shop's data", () => {
  it("downloads the spreadsheet through the share/download helper", async () => {
    render(<MorePage />);
    fireEvent.click(screen.getByRole("button", { name: /Export my data/ }));
    await waitFor(() => expect(state.saved).toHaveLength(1));
    expect(state.saved[0]!.name).toMatch(/^kannect-.*\.csv$/);
    expect(state.saved[0]!.type).toBe("text/csv");
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("says so when the export fails, and can be tried again", async () => {
    state.exportCsv = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(new Blob(["x"], { type: "text/csv" }));
    render(<MorePage />);
    fireEvent.click(screen.getByRole("button", { name: /Export my data/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(state.saved).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Export my data/ }));
    await waitFor(() => expect(state.saved).toHaveLength(1));
  });

  it("is in Malayalam", () => {
    setLocale("ml");
    render(<MorePage />);
    expect(screen.queryByRole("button", { name: /Export my data/ })).toBeNull();
    expect(screen.getAllByRole("button").some((b) => /എക്സ്പോർട്ട്/.test(b.textContent ?? ""))).toBe(true);
  });
});
