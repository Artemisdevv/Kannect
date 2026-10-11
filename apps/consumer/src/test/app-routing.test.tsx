import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock('@/lib/pwa', () => ({ registerAppWorker: vi.fn() }));

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it('keeps discovery, search and settings in separate destinations', () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes('/').at(-1)?.routeId).toBe('/');
    expect(router.matchRoutes('/search').at(-1)?.routeId).toBe('/search');
    expect(router.matchRoutes('/settings').at(-1)?.routeId).toBe('/settings');
  });
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
