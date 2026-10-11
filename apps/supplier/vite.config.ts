// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // The Android app needs static files, not a server: with CAPACITOR_BUILD=1 the build also
    // prerenders an SPA shell (index.html in .output/public). The web build is unchanged.
    ...(process.env["CAPACITOR_BUILD"] === "1" ? { spa: { enabled: true } } : {}),
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
    plugins: [VitePWA({
      // TanStack Start writes the client build to .output/public; without this the plugin looked in
      // dist/, so sw.js was written to the wrong folder (404 once registered) and precached nothing.
      outDir: ".output/public",
      strategies: "generateSW",
      filename: "sw.js",
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: { enabled: false },
      manifest: {
        name: "Kannect Supplier",
        short_name: "Kannect Supplier",
        description: "Supplier dashboard for Kannect",
        start_url: "/",
        scope: "/",
        id: "/",
        display: "standalone",
        theme_color: "#FFFAF0",
        background_color: "#FFFAF0",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,ico,woff2}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: { cacheName: "kannect-supplier-pages", networkTimeoutSeconds: 5, expiration: { maxEntries: 20, maxAgeSeconds: 86400 } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/.*[-.][a-zA-Z0-9_-]{8,}\.(js|css|woff2|jpg|png)$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "kannect-supplier-assets", expiration: { maxEntries: 60, maxAgeSeconds: 2592000 } },
          },
        ],
      },
    })],
  },
});
