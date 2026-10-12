// The logo, favicon and app icons are real files at the sizes the app expects, and the places that
// show them point at them. Regenerate everything with `python branding/generate_assets.py`.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(APP, p));
const text = (p: string) => read(p).toString("utf8");

function pngSize(p: string) {
  const b = read(p);
  expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // a real PNG
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const HEADERS = ["src/components/kannect/shell.tsx", "src/features/auth/login-page.tsx"];
const HEAD = "index.html";

describe("retailer: logo and favicon", () => {
  it("has the header logo as a wide transparent PNG", () => {
    const { w, h } = pngSize("public/kannect-logo.png");
    expect(w).toBeGreaterThan(h * 2);
    expect(read("public/kannect-logo.png")[25]).toBe(6); // RGBA, so it sits on any header colour
  });

  it("has a real .ico favicon, and the page links to it", () => {
    const ico = read("public/favicon.ico");
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(text(HEAD)).toContain("/favicon.ico");
  });

  it("shows the logo image in the header, not text", () => {
    for (const file of HEADERS) {
      const source = text(file);
      expect(source, file).toContain("/kannect-logo.png");
      expect(source, file).toMatch(/alt=\{BRAND\}/);
    }
  });
});

describe("retailer: app icons", () => {
  it("has the PWA and home-screen icons at the declared sizes", () => {
    expect(pngSize("public/icon-192.png")).toEqual({ w: 192, h: 192 });
    expect(pngSize("public/icon-512.png")).toEqual({ w: 512, h: 512 });
    expect(pngSize("public/icon-maskable-512.png")).toEqual({ w: 512, h: 512 });
    expect(pngSize("public/apple-touch-icon.png")).toEqual({ w: 180, h: 180 });
  });

  it("points the web app manifest only at icon files that exist", () => {
    const sources = [...text("vite.config.ts").matchAll(/src: ?"(\/[^"]+\.png)"/g)].map((m) => m[1]!);
    expect(sources.length).toBeGreaterThanOrEqual(3);
    for (const src of sources) expect(existsSync(join(APP, "public", src)), src).toBe(true);
  });

  it("has Android launcher icons for every screen density, and a launcher colour that is not the default white", () => {
    const sizes = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] } as const;
    const res = "android/app/src/main/res";
    for (const [density, [legacy, foreground]] of Object.entries(sizes)) {
      expect(pngSize(`${res}/mipmap-${density}/ic_launcher.png`)).toEqual({ w: legacy, h: legacy });
      expect(pngSize(`${res}/mipmap-${density}/ic_launcher_round.png`)).toEqual({ w: legacy, h: legacy });
      expect(pngSize(`${res}/mipmap-${density}/ic_launcher_foreground.png`)).toEqual({ w: foreground, h: foreground });
    }
    expect(text(`${res}/values/ic_launcher_background.xml`)).toMatch(/#(?!FFFFFF)[0-9A-F]{6}/i);
  });
});
