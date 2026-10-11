import type { CapacitorConfig } from "@capacitor/cli";

// Android wrapper for the shopper app. `bun run android:sync` builds the web app (dist/) and copies
// it into android/. The app talks to the API set in VITE_API_URL at build time (an https URL).
//
// For local testing against the Docker API from an emulator, build with
//   CAPACITOR_DEV=1 VITE_API_URL=http://10.0.2.2:8000/api/v1 bun run android:sync
const dev = process.env["CAPACITOR_DEV"] === "1";

const config: CapacitorConfig = {
  appId: "com.kannect.shopper",
  appName: "Kannect",
  webDir: "dist",
  android: { allowMixedContent: dev },
  // dark status-bar icons on our light header; the app reads the safe-area insets from CSS
  plugins: { SystemBars: { style: "LIGHT", insetsHandling: "css" } },
  server: { androidScheme: dev ? "http" : "https", cleartext: dev },
};

export default config;
