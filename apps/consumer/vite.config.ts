// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  vite: { plugins: [VitePWA({
    strategies: 'generateSW', filename: 'sw.js', registerType: 'autoUpdate', injectRegister: null,
    devOptions: { enabled: false },
    manifest: { name: 'KadaNet', short_name: 'KadaNet', description: 'Find everyday items at nearby local shops.', start_url: '/', scope: '/', id: '/', display: 'standalone', theme_color: '#FFFAF0', background_color: '#FFFAF0', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,png,ico,woff2}'], navigateFallback: null,
      runtimeCaching: [
        { urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/~oauth') && !url.pathname.startsWith('/api/'), handler: 'NetworkFirst', options: { cacheName: 'kadanet-pages', networkTimeoutSeconds: 5, expiration: { maxEntries: 20, maxAgeSeconds: 86400 } } },
        { urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/.*[-.][a-zA-Z0-9_-]{8,}\.(js|css|woff2|jpg|png)$/.test(url.pathname), handler: 'CacheFirst', options: { cacheName: 'kadanet-assets', expiration: { maxEntries: 60, maxAgeSeconds: 2592000 } } },
      ] },
  })] },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
