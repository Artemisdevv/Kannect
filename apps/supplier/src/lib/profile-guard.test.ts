import { describe, expect, it } from "vitest";
import { ApiError } from "./api/client";
import { needsProfile } from "./profile-guard";

describe("needsProfile", () => {
  const missing = new ApiError("not_found", "Supplier profile not found", 404);
  it("sends a supplier with no profile to the profile page", () => {
    expect(needsProfile(missing, "/orders")).toBe(true);
    expect(needsProfile(missing, "/")).toBe(true);
  });
  it("leaves the profile page alone so the form can show", () => {
    expect(needsProfile(missing, "/profile")).toBe(false);
  });
  it("ignores other errors and no error", () => {
    expect(needsProfile(new ApiError("server", "boom", 500), "/orders")).toBe(false);
    expect(needsProfile(new ApiError("network", "offline"), "/orders")).toBe(false);
    expect(needsProfile(null, "/orders")).toBe(false);
  });
});
