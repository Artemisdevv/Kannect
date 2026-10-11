// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Pre-bundle deps used only by lazily loaded routes so the dev server doesn't
    // re-optimize mid-navigation ("error loading dynamically imported module").
    optimizeDeps: {
      include: [
        "@radix-ui/react-progress",
        "@radix-ui/react-select",
        "@radix-ui/react-dialog",
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-switch",
        "@radix-ui/react-label",
        "@radix-ui/react-slot",
        "input-otp",
        "date-fns",
        "sonner",
        "lucide-react",
      ],
    },
  },
});
