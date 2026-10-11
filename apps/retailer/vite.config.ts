import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// Plain client-side React + Vite build (static files in dist/), so the same output can be served
// as a PWA or wrapped by Capacitor. VITE_API_URL is read from the environment by Vite itself.
export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: false }),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "generateSW",
      filename: "sw.js",
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: { enabled: false },
      manifest: {
        id: "/",
        name: "KadaNet Retailer",
        short_name: "KadaNet Shop",
        description: "Manage shop stock, bills, and orders with KadaNet.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#FFFAF0",
        background_color: "#FFFAF0",
        icons: [
          { src: "/icon.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
          { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,jpg}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" && !url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "kadanet-retailer-pages",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 86400 },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\/assets\/.*[-.][a-zA-Z0-9_-]{8,}\.(js|css|woff2|jpg|png)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "kadanet-retailer-assets",
              expiration: { maxEntries: 60, maxAgeSeconds: 2592000 },
            },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
