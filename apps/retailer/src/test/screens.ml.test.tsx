// Every retailer screen, rendered in Malayalam with Malayalam data. Any Latin letter left on the page
// is a string nobody translated (the one allowed word is the brand name, Kannect).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render as plainRender, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signedIn: false,
  products: [] as unknown[],
  orders: [] as unknown[],
  suggestions: [] as unknown[],
  pickups: [] as unknown[],
  bills: [] as unknown[],
  lookup: null as unknown,
  shelf: { detections: [] as unknown[], image_quality: "good" } as unknown,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
const noop = vi.hoisted(() => () => ({ isPending: false, mutateAsync: async () => ({}) }));
const shop = vi.hoisted(() => ({ name: "ശ്രീറാം സ്റ്റോഴ്സ്", address: "കലൂർ", shop_type: "grocery" }));

vi.mock("sonner", () => ({ toast }));
vi.mock("leaflet", () => {
  throw new Error("no map in tests");
});
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => async () => {},
}));
vi.mock("@/api", () => ({
  ApiError: class ApiError extends Error {},
  getShop: () => shop, // the same object every time, or useSyncExternalStore never settles
  subscribe: () => () => {},
  isSignedIn: () => state.signedIn,
  authConfig: async () => ({ otp_provider: "demo" }),
  requestOtp: async () => {},
  signIn: async () => ({ shop: null }),
  signInWithPhoneEmail: async () => ({ shop: null }),
  createShop: async () => ({}),
  signOut: () => {},
  getScanner: () => ({ kind: "native", scanOnce: async () => null, start: async () => () => {} }),
  normalizeBarcode: (s: string) => (/^\d{6,14}$/.test(s.trim()) ? s.trim() : null),
  lookupBarcode: async () => state.lookup,
  createProduct: async () => ({ created: false, similar: [] }),
  shelfPhoto: async () => state.shelf,
  voiceBill: async () => ({ transcript: "", suggestions: [] }),
  cancelOrder: async () => {},
  placeOrder: async () => {},
}));
vi.mock("@/features/queries", () => ({
  keys: { orders: ["o"] },
  useShopProducts: () => ({ data: state.products, isLoading: false, isError: false }),
  useBills: () => ({ data: state.bills }),
  useOrders: () => ({ data: state.orders, isLoading: false }),
  useReorderSuggestions: () => ({ data: state.suggestions }),
  useReceiveOrder: noop,
  usePickups: () => ({ data: state.pickups, isLoading: false, isError: false }),
  usePickupActions: () => ({ accept: noop(), decline: noop(), collect: noop() }),
  useCreateBill: noop,
  useRecount: noop,
  useAddProductsBulk: noop,
}));

import { LoginPage } from "@/features/auth/login-page";
import { BillingPage } from "@/features/billing/billing-page";
import { MorePage } from "@/features/home/more-page";
import { TodayPage } from "@/features/home/home-page";
import { OnboardPage } from "@/features/onboard/onboard-page";
import { OrdersPage } from "@/features/orders/orders-page";
import { PickupsPage } from "@/features/pickups/pickups-page";
import { ScanDialog } from "@/features/scan/scan-dialog";
import { StockPage } from "@/features/stock/stock-page";
import { setLocale, t, tf } from "@/lib/i18n";

const ml = (text: string) => t(text, "ml");
const wrap = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>
);
const render = (node: ReactNode) => plainRender(wrap(node));
/** All the text on the page, apart from the brand name. */
const pageText = () => (document.body.textContent ?? "").replace(/Kannect/g, "").replace(/\b[AP]M\b/g, "");
const expectNoEnglish = () => expect(pageText().match(/[A-Za-z][A-Za-z']+/g) ?? []).toEqual([]);

const products = [
  { product: { id: "p1", name: "മട്ട അരി", brand: "കേരള", size: "", unit: "gram" }, price: 60, stock_qty: 5000, stock_status: "in_stock", needs_recount: false },
  { product: { id: "p2", name: "ബിസ്കറ്റ്", brand: "", size: "", unit: "piece" }, price: 10, stock_qty: 3, stock_status: "low", needs_recount: false },
  { product: { id: "p3", name: "പഞ്ചസാര", brand: "", size: "", unit: "piece" }, price: 45, stock_qty: 0, stock_status: "out", needs_recount: true },
];
const supplier = { id: "s1", name: "മലബാർ മൊത്തവ്യാപാരം", location: { lat: 9.99, lng: 76.3 } };
const order = (over: Record<string, unknown> = {}) => ({
  id: "o1", status: "dispatched", total: 200, supplier, shop: { name: "ശ്രീറാം സ്റ്റോഴ്സ്", location: { lat: 9.98, lng: 76.29 } },
  items: [{ product_id: "p1", name: "മട്ട അരി", packs: 2, unit_price: 100 }],
  tracking: [
    { status: "placed", at: "2026-10-12T10:00:00Z" },
    { status: "dispatched", at: "2026-10-12T11:00:00Z", eta: "2026-10-13T10:00:00Z", note: "പുറപ്പെട്ടു" },
  ],
  ...over,
});
const reservation = (status: string) => ({
  id: `r-${status}`, status, customer_name: "അഞ്ജലി", customer_phone: "+919800000001", total: 80, created_at: "2026-10-12T08:00:00Z",
  hold_until: "2026-10-12T12:00:00Z", note: "വൈകുന്നേരം വരാം", decline_reason: status === "declined" ? "സ്റ്റോക്കില്ല" : null,
  items: [{ product_id: "p1", name: "മട്ട അരി", quantity: 500, unit: "gram" }],
});

beforeEach(() => {
  window.localStorage.clear();
  setLocale("ml");
  state.signedIn = false;
  state.products = products;
  state.orders = [order()];
  state.suggestions = [
    {
      shop_product: { product: { id: "p2", name: "ബിസ്കറ്റ്" } }, reason: "സ്റ്റോക്ക് കുറവാണ്", suggested_packs: 1,
      options: [{ supplier, product: { id: "p2" }, price: 100, pack_size: 12, min_order_packs: 2 }],
    },
  ];
  state.pickups = ["requested", "accepted", "declined", "cancelled", "collected", "expired"].map(reservation);
  state.bills = [];
  state.lookup = null;
  state.shelf = { detections: [], image_quality: "blurry" };
  toast.success.mockReset();
  toast.error.mockReset();
  toast.info.mockReset();
  toast.warning.mockReset();
});
afterEach(cleanup);

describe("retailer screens in Malayalam", () => {
  it("today", () => {
    state.bills = [{ created_at: new Date().toISOString(), total: 120 }];
    render(<TodayPage />);
    expectNoEnglish();
  });

  it("today with nothing in the shop yet", () => {
    state.products = [];
    state.orders = [];
    state.pickups = [];
    render(<TodayPage />);
    expectNoEnglish();
  });

  it("stock, and the count dialog", async () => {
    render(<StockPage />);
    expectNoEnglish();
    fireEvent.click(screen.getByRole("button", { name: tf("Count {name}", { name: "ബിസ്കറ്റ്" }, "ml") }));
    await screen.findByRole("dialog");
    expectNoEnglish();
  });

  it("more", () => {
    render(<MorePage />);
    expectNoEnglish();
  });

  it("the shell's notifications", async () => {
    render(<MorePage />);
    fireEvent.click(screen.getByRole("button", { name: ml("Notifications") }));
    await screen.findByRole("dialog");
    expectNoEnglish();
  });

  it("billing, with items in the bill and the review dialog", async () => {
    render(<BillingPage />);
    expectNoEnglish();
    fireEvent.click(screen.getAllByRole("button", { name: /ചേർക്കുക/ })[1]!);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(ml("Review bill")) }));
    await screen.findByRole("dialog");
    expectNoEnglish();
  });

  it("billing with an empty shop and with no search results", () => {
    state.products = [];
    render(<BillingPage />);
    expectNoEnglish();
    cleanup();
    state.products = products;
    render(<BillingPage />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzz" } });
    expectNoEnglish();
  });

  it("orders, the suggestions and the order details", async () => {
    render(<OrdersPage />);
    expectNoEnglish();
    fireEvent.click(screen.getByRole("button", { name: /വീണ്ടും ഓർഡർ നിർദ്ദേശം/ }));
    await screen.findByRole("dialog");
    expectNoEnglish();
    fireEvent.click(screen.getByText("ബിസ്കറ്റ്"));
    await waitFor(() => expect(screen.getAllByText("ബിസ്കറ്റ്").length).toBeGreaterThan(0));
    expectNoEnglish();
  });

  it("an order in each state", async () => {
    for (const status of ["placed", "accepted", "delivered", "rejected", "cancelled"]) {
      state.orders = [order({ status })];
      const { unmount } = render(<OrdersPage />);
      fireEvent.click(screen.getByText(supplier.name));
      await screen.findByRole("dialog");
      await waitFor(() => expectNoEnglish());
      unmount();
    }
  });

  it("pickup requests, and every action dialog", async () => {
    render(<PickupsPage />);
    expectNoEnglish();
    for (const name of [ml("Accept"), ml("Handed over"), ml("Decline")]) {
      fireEvent.click(screen.getAllByRole("button", { name: new RegExp(name) })[0]!);
      await screen.findByRole("dialog");
      expectNoEnglish();
      fireEvent.keyDown(document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });

  it("pickup requests when there are none", () => {
    state.pickups = [];
    render(<PickupsPage />);
    expectNoEnglish();
  });

  it("shelf photo setup, before and after reading", async () => {
    render(<OnboardPage />);
    expectNoEnglish();
    fireEvent.change(screen.getByTestId("gallery-input"), { target: { files: [new File(["x"], "ഫോട്ടോ", { type: "image/jpeg" })] } });
    expectNoEnglish();
  });

  it("shelf photo results", async () => {
    state.shelf = {
      image_quality: "too_dark",
      detections: [
        { label: "ബിസ്കറ്റ്", read: { name: "ബിസ്കറ്റ്", brand: "", size: "" }, readable: true, visible_count: 3, match: { id: "p2", name: "ബിസ്കറ്റ്", unit: "piece" }, alternatives: [{ id: "p9", name: "കേക്ക്", unit: "piece" }], suggested_price: 10, price_source: "mrp" },
        { label: "അരി", read: { name: "അരി", brand: "", size: "" }, readable: true, loose: true, suggested_level: "some", alternatives: [], in_shop: true, current_quantity: 2000 },
      ],
    };
    render(<OnboardPage />);
    fireEvent.change(screen.getByTestId("gallery-input"), { target: { files: [new File(["x"], "ഫോട്ടോ", { type: "image/jpeg" })] } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(ml("Read photos")) }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(String(toast.warning.mock.calls[0]![0])).not.toMatch(/[A-Za-z]/);
    await screen.findByText(/ഇനങ്ങൾ കണ്ടെത്തി/);
    expectNoEnglish();
  });

  it("login: phone, code and shop set-up", async () => {
    render(<LoginPage />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    expectNoEnglish();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "123" } });
    fireEvent.blur(screen.getByRole("textbox"));
    expectNoEnglish();
    cleanup();

    state.signedIn = true;
    render(<LoginPage />);
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "x" } });
    fireEvent.blur(screen.getAllByRole("textbox")[0]!);
    expectNoEnglish();
  });

  it("the barcode dialog: scanning, a new product and a known one", async () => {
    render(<ScanDialog open onOpenChange={() => {}} onProduct={() => {}} />);
    expectNoEnglish();
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "12" } });
    fireEvent.submit(box.closest("form")!);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(String(toast.error.mock.calls[0]![0])).not.toMatch(/[A-Za-z]/);

    fireEvent.change(box, { target: { value: "8901719124754" } });
    fireEvent.submit(box.closest("form")!);
    await waitFor(() => expect(screen.getAllByRole("textbox").length).toBeGreaterThan(1)); // the new-product form
    expectNoEnglish();
    cleanup();

    state.lookup = { id: "p9", name: "കേക്ക്", brand: "", size: "", unit: "gram", mrp: 50 };
    render(<ScanDialog open onOpenChange={() => {}} onProduct={() => {}} />);
    const box2 = screen.getByRole("textbox");
    fireEvent.change(box2, { target: { value: "8901719124754" } });
    fireEvent.submit(box2.closest("form")!);
    await waitFor(() => expect(screen.getByDisplayValue("50")).toBeInTheDocument()); // the add-to-shop form
    expectNoEnglish();
  });
});
