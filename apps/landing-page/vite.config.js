import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const TUNNEL_HOST = "clinic-unstylish-armoire.ngrok-free.dev";
const allowedHosts = ["localhost", TUNNEL_HOST];

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(root, "./src") } },
  server: {
    allowedHosts,
  },
  // For judges prefer the production build: `npm run build && npm run preview -- --port 5173`.
  // It is faster, has no hot-reload socket and does not mount components twice.
  preview: { allowedHosts },
});
