import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  join: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const fake = vi.hoisted(() => ({ ApiError: class ApiError extends Error {} }));

vi.mock("@/features/queries", () => ({
  useOpenGroupBuys: () => state.query,
  useJoinGroupBuy: () => ({ isPending: false, mutateAsync: state.join }),
}));
vi.mock("@/api", () => ({ ApiError: fake.ApiError }));
vi.mock("@/components/kannect/shell", () => ({
  Shell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("sonner", () => ({ toast }));

import { GroupBuyDetailPage } from "./group-buy-detail-page";
import { GroupBuysPage } from "./group-buys-page";

const future = () => new Date(Date.now() + 3 * 86400000).toISOString();
const past = () => new Date(Date.now() - 3600000).toISOString();

const buy = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  supplier: { name: "Malabar Wholesale" },
  product: { name: "Jaya Rice", brand: "Malabar", size: "25 kg", unit: "piece" },
  pack_size: 12,
  tiers: [
    { min_packs: 10, price: 95 },
    { min_packs: 40, price: 80 },
  ],
  pooled_packs: 12,
  shops_joined: 3,
  current_price: 95,
  deadline: future(),
  status: "open",
  my_packs: null,
  ...over,
});

const loaded = (items: unknown[]) => {
  state.query = { data: items, isLoading: false, isError: false, error: null, refetch: vi.fn() };
};

beforeEach(() => {
  state.join = vi.fn().mockResolvedValue({});
  toast.success.mockReset();
  toast.error.mockReset();
  loaded([buy()]);
});

describe("GroupBuyDetailPage", () => {
  it("goes from loading to loaded without crashing (hooks must not change between renders)", () => {
    state.query = { data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() };
    const { rerender } = render(<GroupBuyDetailPage id="g1" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Loading/);
    loaded([buy()]);
    rerender(<GroupBuyDetailPage id="g1" />);
    expect(screen.getByRole("heading", { name: "Malabar Jaya Rice 25 kg" })).toBeInTheDocument();
  });

  it("shows the API's current price, pooled packs and the next tier", () => {
    render(<GroupBuyDetailPage id="g1" />);
    expect(screen.getByText("Malabar Wholesale")).toBeInTheDocument();
    expect(screen.getByText(/12 pcs per pack · 3 shops joined/)).toBeInTheDocument();
    expect(screen.getByText(/28 more packs/)).toBeInTheDocument();
    expect(screen.getByText("Not joined")).toBeInTheDocument();
  });

  it("joins with the number of packs the shop chose", async () => {
    render(<GroupBuyDetailPage id="g1" />);
    fireEvent.click(screen.getByRole("button", { name: "More packs" }));
    fireEvent.click(screen.getByRole("button", { name: "More packs" }));
    expect(screen.getByLabelText("Packs to commit")).toHaveValue(3);
    fireEvent.click(screen.getByRole("button", { name: "Join group buy" }));
    await waitFor(() => expect(state.join).toHaveBeenCalledWith({ groupBuyId: "g1", packs: 3 }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("starts from the shop's current commitment and offers to update it", () => {
    loaded([buy({ my_packs: 5 })]);
    render(<GroupBuyDetailPage id="g1" />);
    expect(screen.getByText("5 packs joined")).toBeInTheDocument();
    expect(screen.getByLabelText("Packs to commit")).toHaveValue(5);
    expect(screen.getByRole("button", { name: "Update commitment" })).toBeInTheDocument();
  });

  it("never sends fewer than one pack", () => {
    render(<GroupBuyDetailPage id="g1" />);
    fireEvent.change(screen.getByLabelText("Packs to commit"), { target: { value: "0" } });
    expect(screen.getByLabelText("Packs to commit")).toHaveValue(1);
    fireEvent.click(screen.getByRole("button", { name: "Fewer packs" }));
    expect(screen.getByLabelText("Packs to commit")).toHaveValue(1);
  });

  it("shows the server's reason when joining fails", async () => {
    state.join = vi.fn().mockRejectedValue(new fake.ApiError("Set the shop location first"));
    render(<GroupBuyDetailPage id="g1" />);
    fireEvent.click(screen.getByRole("button", { name: "Join group buy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Set the shop location first");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("offers no join once the deadline has passed", () => {
    loaded([buy({ deadline: past() })]);
    render(<GroupBuyDetailPage id="g1" />);
    expect(screen.queryByRole("button", { name: /Join group buy|Update commitment/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/closed/i);
  });

  it("says so when this group buy is not available to the shop", () => {
    loaded([buy({ id: "other" })]);
    render(<GroupBuyDetailPage id="g1" />);
    expect(screen.getByText(/not open to your shop/i)).toBeInTheDocument();
  });

  it("shows a retry when the list cannot be loaded", () => {
    state.query = { data: undefined, isLoading: false, isError: true, error: new Error("offline"), refetch: vi.fn() };
    render(<GroupBuyDetailPage id="g1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("offline");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.query.refetch).toHaveBeenCalled();
  });
});

describe("GroupBuysPage", () => {
  it("lists deals the shop joined (my_packs) apart from the others", () => {
    loaded([buy({ id: "mine", my_packs: 4 }), buy({ id: "free", product: { name: "Sugar", unit: "piece" } })]);
    render(<GroupBuysPage />);
    expect(screen.getByRole("heading", { name: "You joined" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Available" })).toBeInTheDocument();
    expect(screen.getByText("Joined 4 packs")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /View details/ })).toHaveLength(2);
  });

  it("shows an empty state when nothing is open", () => {
    loaded([]);
    render(<GroupBuysPage />);
    expect(screen.getByText("No open group buys")).toBeInTheDocument();
  });

  it("does not list a deal that has closed", () => {
    loaded([buy({ id: "old", deadline: past() })]);
    render(<GroupBuysPage />);
    expect(screen.getByText("No open group buys")).toBeInTheDocument();
  });

  it("shows a retry when loading fails", () => {
    state.query = { data: undefined, isLoading: false, isError: true, error: new Error("offline"), refetch: vi.fn() };
    render(<GroupBuysPage />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.query.refetch).toHaveBeenCalled();
  });
});
