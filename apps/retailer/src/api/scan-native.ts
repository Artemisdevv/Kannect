// Android scanner: Google's ML Kit code scanner through Capacitor. It opens the system scanner UI,
// needs no camera preview inside the web page, and is much faster and more reliable than decoding
// video frames in a WebView. Registered once at startup when running inside the Android app.
import { BarcodeFormat, BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

import { normalizeBarcode, registerNativeScanner, type Scanner } from "./scan";

const FORMATS = [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.Code128];

const nativeScanner: Scanner = {
  kind: "native",
  async start() {
    return () => {}; // the native scanner is one-shot, see scanOnce
  },
  async scanOnce() {
    // First use on a phone: Google Play services downloads the scanner module (a few MB).
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule();
    const { barcodes } = await BarcodeScanner.scan({ formats: FORMATS });
    const raw = barcodes[0]?.rawValue;
    return raw ? normalizeBarcode(raw) : null;
  },
};

export function useNativeScanner() {
  registerNativeScanner(nativeScanner);
}
