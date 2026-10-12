import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocale } from "@/lib/i18n";
import { LanguageSwitcher } from "./language-switcher";

beforeEach(() => {
  window.localStorage.clear();
  act(() => setLocale("en"));
});

const open = () => {
  const trigger = screen.getByRole("button", { name: "Language" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return trigger;
};

describe("LanguageSwitcher", () => {
  it("shows the current language on a compact button", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: "Language" })).toHaveTextContent("EN");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("lists each language in its own script, with the current one ticked", async () => {
    render(<LanguageSwitcher />);
    open();
    const english = await screen.findByRole("menuitemradio", { name: "English" });
    const malayalam = screen.getByRole("menuitemradio", { name: "മലയാളം" });
    expect(english).toHaveAttribute("aria-checked", "true");
    expect(malayalam).toHaveAttribute("aria-checked", "false");
  });

  it("switches to Malayalam, remembers it, and updates the button", async () => {
    render(<LanguageSwitcher />);
    open();
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "മലയാളം" }));
    expect(getLocale()).toBe("ml");
    expect(window.localStorage.getItem("kannect.retailer.locale")).toBe("ml");
    expect(document.documentElement.lang).toBe("ml");
    expect(screen.getByRole("button", { name: "ഭാഷ" })).toHaveTextContent("മല");
  });

  it("switches back to English", async () => {
    act(() => setLocale("ml"));
    render(<LanguageSwitcher />);
    fireEvent.keyDown(screen.getByRole("button", { name: "ഭാഷ" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "English" }));
    expect(getLocale()).toBe("en");
    expect(screen.getByRole("button", { name: "Language" })).toHaveTextContent("EN");
  });
});
