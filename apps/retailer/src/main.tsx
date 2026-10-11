import { Capacitor } from "@capacitor/core";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { router } from "./router";
import "./styles.css";

void import("./lib/pwa").then(({ registerAppWorker }) => registerAppWorker());

// Inside the Android app the camera scanner is the native ML Kit one.
if (Capacitor.isNativePlatform()) {
  void import("./api/scan-native").then(({ useNativeScanner }) => useNativeScanner());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
