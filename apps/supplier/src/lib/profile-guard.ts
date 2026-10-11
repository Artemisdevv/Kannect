import { ApiError } from "./api/client";

/** A supplier who has not made a profile yet can do nothing else, so every page sends them to it. */
export function needsProfile(error: unknown, pathname: string): boolean {
  return error instanceof ApiError && error.kind === "not_found" && pathname !== "/profile";
}
