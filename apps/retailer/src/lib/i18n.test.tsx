import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, t, tf, translations, useLocale } from "./i18n";

const hasMalayalam = (s: string) => /[ഀ-ൿ]/.test(s);

beforeEach(() => {
  window.localStorage.clear();
  setLocale("en");
});

describe("t", () => {
  it("leaves English unchanged", () => {
    expect(t("Sign out", "en")).toBe("Sign out");
  });

  it("translates a known string into Malayalam", () => {
    const out = t("Sign out", "ml");
    expect(hasMalayalam(out)).toBe(true);
    expect(out).not.toBe("Sign out");
  });

  it("falls back to the English text when there is no translation", () => {
    expect(t("A sentence nobody translated", "ml")).toBe("A sentence nobody translated");
  });
});

describe("tf (sentences with placeholders)", () => {
  it("fills placeholders in English", () => {
    expect(tf("Joined {n} packs", { n: 3 }, "en")).toBe("Joined 3 packs");
  });

  it("translates the whole sentence first, then fills it, so word order can change", () => {
    const out = tf("Joined {n} packs", { n: 3 }, "ml");
    expect(hasMalayalam(out)).toBe(true);
    expect(out).toContain("3");
    expect(out).not.toContain("{");
    expect(out).not.toMatch(/[A-Za-z]/);
  });

  it("leaves a placeholder alone when no value is given", () => {
    expect(tf("Hello {name}", {}, "en")).toBe("Hello {name}");
  });

  it("fills every occurrence", () => {
    expect(tf("{n} and {n}", { n: 2 }, "en")).toBe("2 and 2");
  });
});

describe("locale", () => {
  it("defaults to English", () => {
    expect(getLocale()).toBe("en");
  });

  it("is remembered on the phone and set on the page's lang", () => {
    setLocale("ml");
    expect(getLocale()).toBe("ml");
    expect(window.localStorage.getItem("kannect.retailer.locale")).toBe("ml");
    expect(document.documentElement.lang).toBe("ml");
  });

  it("re-renders components that use the hook when the language changes", () => {
    const { result } = renderHook(() => useLocale());
    expect(result.current).toBe("en");
    act(() => setLocale("ml"));
    expect(result.current).toBe("ml");
    act(() => setLocale("en"));
    expect(result.current).toBe("en");
  });

  it("ignores an unknown stored value and stays English", () => {
    window.localStorage.setItem("kannect.retailer.locale", "fr");
    expect(getLocale()).toBe("en");
  });
});

describe("the Malayalam dictionary", () => {
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  const entries = Object.entries(translations());

  it("has no empty translations", () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(entries.filter(([, value]) => value.trim() === "")).toEqual([]);
  });

  it("keeps the same {placeholders} as the English sentence, so a sentence cannot lose its numbers", () => {
    const broken = entries.filter(([key, value]) => placeholders(key) !== placeholders(value)).map(([key]) => key);
    expect(broken).toEqual([]);
  });

  it("is Malayalam (not left in English) apart from brand words and numbers", () => {
    const english = entries.filter(([, value]) => !hasMalayalam(value)).map(([key]) => key);
    expect(english).toEqual([]);
  });

  it("translates what the More menu lists for group buys", () => {
    expect(hasMalayalam(t("Group buys", "ml"))).toBe(true);
    expect(hasMalayalam(t("Join supplier deals with other shops", "ml"))).toBe(true);
  });
});
