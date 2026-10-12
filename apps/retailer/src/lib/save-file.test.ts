import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  isNative: false,
  written: [] as { path: string; data: string; directory: string }[],
  shared: [] as { title?: string; url?: string }[],
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.isNative } }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: {
    writeFile: async (o: { path: string; data: string; directory: string }) => {
      native.written.push(o);
      return { uri: `file:///cache/${o.path}` };
    },
  },
}));
vi.mock("@capacitor/share", () => ({
  Share: {
    share: async (o: { title?: string; url?: string }) => {
      native.shared.push(o);
    },
  },
}));

import { saveFile } from "./save-file";

beforeEach(() => {
  native.isNative = false;
  native.written = [];
  native.shared = [];
});
afterEach(() => vi.restoreAllMocks());

describe("saveFile in a browser", () => {
  it("downloads the file through a temporary link, then cleans up", async () => {
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    const create = vi.fn(() => "blob:fake-1");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));

    await saveFile("report.csv", new Blob(["a,b\n1,2"], { type: "text/csv" }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([{ href: "blob:fake-1", download: "report.csv" }]);
    expect(revoke).toHaveBeenCalledWith("blob:fake-1");
    expect(document.querySelector("a[download]")).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("saveFile in the Android app", () => {
  it("writes the file to the cache and opens the share sheet (a blob link would not download there)", async () => {
    native.isNative = true;
    await saveFile("report.csv", new Blob(["a,b\n1,2"], { type: "text/csv" }), "Shop data");

    expect(native.written).toHaveLength(1);
    expect(native.written[0]!.path).toBe("report.csv");
    expect(native.written[0]!.directory).toBe("CACHE");
    expect(atob(native.written[0]!.data)).toBe("a,b\n1,2");
    expect(native.shared).toEqual([{ title: "Shop data", url: "file:///cache/report.csv" }]);
  });

  it("keeps non-ASCII text intact (Malayalam product names in a CSV)", async () => {
    native.isNative = true;
    await saveFile("r.csv", new Blob(["പേര്,വില\nഅരി,60"], { type: "text/csv" }));
    const bytes = Uint8Array.from(atob(native.written[0]!.data), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe("പേര്,വില\nഅരി,60");
  });
});
