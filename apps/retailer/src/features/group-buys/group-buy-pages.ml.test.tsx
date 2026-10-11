// In Malayalam, every word of the group-buy screens must be Malayalam. The test data is Malayalam
// too (product, supplier, error text), so any Latin letter left on the page is an untranslated UI
// string.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  join: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/features/queries", () => ({
  useOpenGroupBuys: () => state.query,
  useJoinGroupBuy: () => ({ isPending: false, mutateAsync: state.join }),
}));
vi.mock("@/api", () => ({ ApiError: class ApiError extends Error {} }));
vi.mock("@/components/kannect/shell", () => ({
  Shell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("sonner", () => ({ toast }));

import { setLocale } from "@/lib/i18n";
import { GroupBuyDetailPage } from "./group-buy-detail-page";
import { GroupBuysPage } from "./group-buys-page";

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

const buy = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  supplier: { name: "മലബാർ മൊത്തവ്യാപാരം" },
  product: { name: "മട്ട അരി", brand: "കേരള", size: "25 കിലോ", unit: "piece" },
  pack_size: 12,
  tiers: [
    { min_packs: 10, price: 95 },
    { min_packs: 40, price: 80 },
  ],
  pooled_packs: 12,
  shops_joined: 3,
  current_price: 95,
  deadline: future(3),
  status: "open",
  my_packs: null,
  ...over,
});

const loaded = (items: unknown[]) => {
  state.query = { data: items, isLoading: false, isError: false, error: null, refetch: vi.fn() };
};
const page = () => document.body.textContent ?? "";
const noEnglish = () => expect(page()).not.toMatch(/[A-Za-z]/);

beforeEach(() => {
  window.localStorage.clear();
  setLocale("ml");
  state.join = vi.fn().mockResolvedValue({});
  toast.success.mockReset();
  toast.error.mockReset();
  loaded([buy()]);
});

describe("group-buy list in Malayalam", () => {
  it("translates the joined and available sections, cards and links", () => {
    loaded([buy({ id: "a", my_packs: 4 }), buy({ id: "b", my_packs: 1 }), buy({ id: "c" })]);
    render(<GroupBuysPage />);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
    noEnglish();
  });

  it("translates the empty, loading and error states", () => {
    loaded([]);
    const { unmount } = render(<GroupBuysPage />);
    noEnglish();
    unmount();

    state.query = { data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() };
    const loading = render(<GroupBuysPage />);
    noEnglish();
    loading.unmount();

    state.query = { data: undefined, isLoading: false, isError: true, error: new Error("കണക്ഷൻ ഇല്ല"), refetch: vi.fn() };
    render(<GroupBuysPage />);
    noEnglish();
  });
});

describe("group-buy detail in Malayalam", () => {
  it("translates an open deal the shop has not joined", () => {
    render(<GroupBuyDetailPage id="g1" />);
    noEnglish();
  });

  it("translates an open deal the shop has joined, with one pack and with many", () => {
    loaded([buy({ my_packs: 1 })]);
    const one = render(<GroupBuyDetailPage id="g1" />);
    noEnglish();
    one.unmount();
    loaded([buy({ my_packs: 5, pooled_packs: 45, shops_joined: 1 })]);
    render(<GroupBuyDetailPage id="g1" />);
    noEnglish();
  });

  it("translates the single-pack and single-shop wordings", () => {
    loaded([buy({ pooled_packs: 39, shops_joined: 1 })]);
    render(<GroupBuyDetailPage id="g1" />);
    noEnglish();
  });

  it("translates a closed deal, a missing deal, loading and an error", () => {
    loaded([buy({ deadline: new Date(Date.now() - 3600000).toISOString() })]);
    const closed = render(<GroupBuyDetailPage id="g1" />);
    noEnglish();
    closed.unmount();

    loaded([buy({ id: "other" })]);
    const missing = render(<GroupBuyDetailPage id="g1" />);
    noEnglish();
    missing.unmount();

    state.query = { data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() };
    const loading = render(<GroupBuyDetailPage id="g1" />);
    noEnglish();
    loading.unmount();

    state.query = { data: undefined, isLoading: false, isError: true, error: new Error("കണക്ഷൻ ഇല്ല"), refetch: vi.fn() };
    render(<GroupBuyDetailPage id="g1" />);
    noEnglish();
  });

  it("translates the buttons' accessible names and the success message", async () => {
    render(<GroupBuyDetailPage id="g1" />);
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
    expect(names.join(" ")).not.toMatch(/[A-Za-z]/);
    expect(screen.getByLabelText(/./, { selector: "input" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button").at(-1)!);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(String(toast.success.mock.calls[0]![0])).not.toMatch(/[A-Za-z]/);
  });

  it("translates the message when joining fails for a reason the server did not explain", async () => {
    state.join = vi.fn().mockRejectedValue(new Error("network"));
    render(<GroupBuyDetailPage id="g1" />);
    fireEvent.click(screen.getAllByRole("button").at(-1)!);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/[A-Za-z]/);
  });
});
