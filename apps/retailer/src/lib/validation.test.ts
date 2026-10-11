import { describe, expect, it } from "vitest";

import { parsePhone, tidy, validateShop } from "./validation";

describe("parsePhone", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["(90000) 00002", "+919000000002"],
  ])("accepts %s", (input, expected) => expect(parsePhone(input).e164).toBe(expected));

  it.each([
    ["", "10 digits"],
    ["12345", "10 digits"],
    ["5876543210", "start with"],
    ["98765abcde", "digits only"],
    ["98765432109999", "10 digits"],
    ["98+7654321", "digits only"],
  ])("rejects %s", (input, hint) => expect(parsePhone(input).error).toContain(hint));
});

describe("validateShop", () => {
  const ok = { name: "Adnan Stores", owner_name: "Muhammed Adnan", address: "Palamukku" };

  it("accepts a normal form and optional blanks", () => {
    expect(validateShop(ok)).toEqual({});
    expect(validateShop({ ...ok, owner_name: "", address: "" })).toEqual({});
  });

  it.each(["", " ", "A", "  x  ", "---", "!!"])("rejects the name %j", (name) =>
    expect(validateShop({ ...ok, name }).name).toBeTruthy(),
  );

  it("accepts Malayalam names", () => expect(validateShop({ ...ok, name: "അദ്നാൻ സ്റ്റോഴ്സ്" })).toEqual({}));

  it("enforces the length limits", () => {
    expect(validateShop({ ...ok, name: "x".repeat(121) }).name).toBeTruthy();
    expect(validateShop({ ...ok, owner_name: "x".repeat(121) }).owner_name).toBeTruthy();
    expect(validateShop({ ...ok, address: "x".repeat(501) }).address).toBeTruthy();
  });
});

it("tidy collapses and trims spaces", () => expect(tidy("  a   b \n c ")).toBe("a b c"));
