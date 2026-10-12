import { describe, expect, it } from "vitest";
import { billShareText, whatsappLink } from "./share";

describe("whatsappLink", () => {
  it("opens WhatsApp's chooser with the message filled in", () => {
    const link = whatsappLink("Hello there");
    expect(link).toBe("https://wa.me/?text=Hello%20there");
  });

  it("keeps characters that would break a link safe", () => {
    const text = "Total ₹120 & more? #1 https://x.test/b/1?a=1&b=2";
    const link = whatsappLink(text);
    expect(link.startsWith("https://wa.me/?text=")).toBe(true);
    expect(new URL(link).searchParams.get("text")).toBe(text);
  });

  it("can go straight to one customer's number", () => {
    const link = whatsappLink("Hi", "+91 98765-43210");
    expect(link).toBe("https://wa.me/919876543210?text=Hi");
  });

  it("ignores a number that is not usable and falls back to the chooser", () => {
    expect(whatsappLink("Hi", "abc")).toBe("https://wa.me/?text=Hi");
    expect(whatsappLink("Hi", "123")).toBe("https://wa.me/?text=Hi");
  });
});

describe("billShareText", () => {
  it("names the shop, the amount and the e-bill link, in English", () => {
    const text = billShareText({ shop: "Sreeram Stores", total: 120, url: "https://kannect.test/b/1" }, "en");
    expect(text).toContain("Sreeram Stores");
    expect(text).toContain("₹120");
    expect(text).toContain("https://kannect.test/b/1");
  });

  it("is Malayalam around the shop name, amount and link", () => {
    const text = billShareText({ shop: "ശ്രീറാം", total: 120, url: "https://kannect.test/b/1" }, "ml");
    expect(text).toMatch(/[ഀ-ൿ]/);
    expect(text).toContain("ശ്രീറാം");
    expect(text).toContain("https://kannect.test/b/1");
    expect(text.replace("https://kannect.test/b/1", "")).not.toMatch(/[A-Za-z]/);
  });

  it("still works without a shop name", () => {
    const text = billShareText({ total: 50, url: "https://kannect.test/b/2" }, "en");
    expect(text).toContain("https://kannect.test/b/2");
    expect(text).not.toContain("undefined");
  });
});
