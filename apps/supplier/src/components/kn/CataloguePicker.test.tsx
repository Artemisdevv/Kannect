import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const search = vi.fn();
vi.mock("@/lib/api/service", () => ({ searchCatalogue: (q: string) => search(q) }));

import { CataloguePicker } from "./CataloguePicker";

const renderPicker = (onPick = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CataloguePicker onPick={onPick} />
    </QueryClientProvider>,
  );
  return onPick;
};

afterEach(() => search.mockReset());

describe("CataloguePicker", () => {
  it("asks for at least two letters before searching", () => {
    renderPicker();
    expect(screen.getByText(/at least 2 letters/i)).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
  });

  it("searches after typing and hands back the chosen product", async () => {
    search.mockResolvedValue([{ id: "p1", name: "Jaya Rice 25 kg", sku: "8901", category: "Rice", unit: "pcs" }]);
    const onPick = renderPicker();
    fireEvent.change(screen.getByPlaceholderText(/search by name/i), { target: { value: "rice" } });
    const row = await screen.findByText("Jaya Rice 25 kg", undefined, { timeout: 2000 });
    expect(search).toHaveBeenCalledWith("rice");
    fireEvent.click(row);
    expect(onPick).toHaveBeenCalledWith({ id: "p1", name: "Jaya Rice 25 kg", sku: "8901", category: "Rice", unit: "pcs" });
  });

  it("says so when nothing matches", async () => {
    search.mockResolvedValue([]);
    renderPicker();
    fireEvent.change(screen.getByPlaceholderText(/search by name/i), { target: { value: "zzz" } });
    await waitFor(() => expect(screen.getByText(/No catalogue product matches/i)).toBeTruthy(), { timeout: 2000 });
  });
});
