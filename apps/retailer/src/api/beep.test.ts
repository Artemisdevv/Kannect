import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Node = { connect: ReturnType<typeof vi.fn> };
let created: { osc: Node & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; frequency: { value: number }; type: string }; gain: Node & { gain: { setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> } } }[];
let contexts: number;

class FakeAudioContext {
  currentTime = 10;
  state = "running";
  destination = {};
  constructor() {
    contexts += 1;
  }
  resume = vi.fn(async () => {});
  createOscillator() {
    const osc = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { value: 0 }, type: "" };
    const gain = { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } };
    created.push({ osc, gain });
    return osc;
  }
  createGain() {
    return created.at(-1)!.gain;
  }
}

beforeEach(() => {
  vi.resetModules();
  created = [];
  contexts = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("playScanBeep", () => {
  it("plays one short, quiet tone", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { playScanBeep } = await import("./beep");
    playScanBeep();
    const { osc, gain } = created[0]!;
    expect(osc.type).toBe("sine");
    expect(osc.frequency.value).toBeGreaterThan(800);
    expect(osc.start).toHaveBeenCalledTimes(1);
    const stopAt = osc.stop.mock.calls[0]![0] as number;
    expect(stopAt - 10).toBeGreaterThan(0.03);
    expect(stopAt - 10).toBeLessThan(0.2); // a beep, not a tone
    expect(gain.gain.setValueAtTime.mock.calls[0]![0]).toBeLessThanOrEqual(0.2); // subtle
  });

  it("reuses one audio context for every beep", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { playScanBeep } = await import("./beep");
    playScanBeep();
    playScanBeep();
    expect(contexts).toBe(1);
    expect(created).toHaveLength(2);
  });

  it("does nothing, and does not throw, when audio is unavailable", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const { playScanBeep } = await import("./beep");
    expect(() => playScanBeep()).not.toThrow();
  });

  it("does not throw when the browser refuses to start audio", async () => {
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("blocked"); } });
    const { playScanBeep } = await import("./beep");
    expect(() => playScanBeep()).not.toThrow();
  });
});

describe("the native scanner beeps when it reads a code", () => {
  const scanWith = async (barcodes: { rawValue?: string }[]) => {
    vi.resetModules();
    const beep = vi.fn();
    vi.doMock("./beep", () => ({ playScanBeep: beep }));
    vi.doMock("@capacitor-mlkit/barcode-scanning", () => ({
      BarcodeFormat: { Ean13: 1, Ean8: 2, UpcA: 3, UpcE: 4, Code128: 5 },
      BarcodeScanner: {
        isGoogleBarcodeScannerModuleAvailable: async () => ({ available: true }),
        installGoogleBarcodeScannerModule: async () => {},
        scan: async () => ({ barcodes }),
      },
    }));
    let registered: { scanOnce?: () => Promise<string | null> } | undefined;
    vi.doMock("./scan", async (orig) => ({
      ...(await orig<typeof import("./scan")>()),
      registerNativeScanner: (s: typeof registered) => (registered = s),
    }));
    const { useNativeScanner } = await import("./scan-native");
    useNativeScanner();
    const code = await registered!.scanOnce!();
    return { beep, code };
  };

  it("beeps for a valid barcode", async () => {
    const { beep, code } = await scanWith([{ rawValue: "8901719124754" }]);
    expect(code).toBe("8901719124754");
    expect(beep).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when nothing was scanned or the code is not a product barcode", async () => {
    expect((await scanWith([])).beep).not.toHaveBeenCalled();
    expect((await scanWith([{ rawValue: "HELLO" }])).beep).not.toHaveBeenCalled();
  });
});
