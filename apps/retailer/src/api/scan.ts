// One barcode-scanning entry point for the whole app. On the web it uses the camera through ZXing;
// the Capacitor (Android) build registers a native ML Kit scanner with `registerNativeScanner`
// and screens do not change.
import { BrowserMultiFormatReader } from "@zxing/browser";

export interface Scanner {
  /** Start scanning into `video`. Calls `onCode` for each decoded code. Returns a stop function. */
  start(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void>;
}

/** Keep only a plausible barcode: 6 to 14 digits (what the catalogue accepts). Otherwise null. */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.trim();
  return /^\d{6,14}$/.test(digits) ? digits : null;
}

const webScanner: Scanner = {
  async start(video, onCode) {
    const reader = new BrowserMultiFormatReader();
    let last = "";
    const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
      const code = result ? normalizeBarcode(result.getText()) : null;
      // the camera reports the same code every frame: only pass a code on when it changes
      if (code && code !== last) {
        last = code;
        onCode(code);
      }
    });
    return () => controls.stop();
  },
};

let native: Scanner | null = null;

/** Called once by the Capacitor entry point with a scanner built on @capacitor-mlkit/barcode-scanning. */
export function registerNativeScanner(scanner: Scanner) {
  native = scanner;
}

export function getScanner(): Scanner {
  return native ?? webScanner;
}
