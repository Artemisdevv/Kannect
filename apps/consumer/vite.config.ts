import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Plain client-side React + Vite build (static files in dist/): servable as a PWA and wrappable by
// Capacitor for Android. VITE_API_URL is read from the environment by Vite itself.
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
        name: "Kannect",
        short_name: "Kannect",
        description: "Find everyday items at nearby local shops.",
        start_url: "/",
        scope: "/",
        id: "/",
        display: "standalone",
        theme_color: "#FFFAF0",
        background_color: "#FFFAF0",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,ico,woff2}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: { cacheName: "kannect-pages", networkTimeoutSeconds: 5, expiration: { maxEntries: 20, maxAgeSeconds: 86400 } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/.*[-.][a-zA-Z0-9_-]{8,}\.(js|css|woff2|jpg|png)$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "kannect-assets", expiration: { maxEntries: 60, maxAgeSeconds: 2592000 } },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
