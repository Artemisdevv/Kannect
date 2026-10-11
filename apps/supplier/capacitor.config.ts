import type { CapacitorConfig } from "@capacitor/cli";

// Android wrapper for the supplier app. `bun run android:sync` builds the web app (.output/public/) and copies
// it into android/. The app talks to the API set in VITE_API_URL at build time (an https URL).
//
// For local testing against the Docker API from an emulator, build with
//   CAPACITOR_DEV=1 VITE_API_URL=http://10.0.2.2:8000/api/v1 bun run android:sync
// which serves the app over http so it may call the plain-http API (10.0.2.2 is the host machine).
const dev = process.env["CAPACITOR_DEV"] === "1";

const config: CapacitorConfig = {
  appId: "com.kannect.supplier",
  appName: "Kannect Supplier",
  webDir: ".output/public",
  android: { allowMixedContent: dev },
  // dark status-bar icons on our light header; the app reads the safe-area insets from CSS
  plugins: { SystemBars: { style: "LIGHT", insetsHandling: "css" } },
  server: { androidScheme: dev ? "http" : "https", cleartext: dev },
};

export default config;
