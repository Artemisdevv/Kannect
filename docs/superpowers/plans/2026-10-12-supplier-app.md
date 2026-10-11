# Supplier App: Live API and Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/supplier` talks to the real API (demo OTP login, catalogue, orders, invoices, demand, group buys) and builds as an Android debug APK `com.kannect.supplier`.

**Architecture:** Keep Shreyas's screens and app-side types. A new `live.ts` implements the same `api` object over the real endpoints and a pure `mappers.ts` converts API shapes (snake_case, `placed`, catalogue products) to the app's shapes. `service.ts` picks demo or live from `VITE_API_URL`. Android needs a static SPA build, which the TanStack Start (SSR) app does not produce today: Task 6 is a spike for that.

**Tech Stack:** React 19, TanStack Start/Router/Query, Vite, Vitest, `openapi-typescript` (types only, the existing `request()` fetch wrapper stays; this drops `openapi-fetch` from the spec), Capacitor 8, FastAPI backend, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-12-supplier-app-design.md`

## Global Constraints
- Branch `feat/supplier-app`, from `main` (`ee47059`). `git fetch` before every push; Shreyas also commits to `apps/supplier`.
- Do not commit `apps/supplier/package-lock.json` or `apps/supplier/src/routeTree.gen.ts` changes made only by the dev server. If routes are added, regenerate (`bun run build`) and commit the tree.
- CI runs `ruff check` with line length 100 on `backend/`.
- Demo mode (no `VITE_API_URL`) must keep working unchanged.
- App id `com.kannect.supplier`; same Capacitor 8 versions as `apps/retailer` (`^8.5.3`).
- API errors look like `{"error":{"code":"...","message":"..."}}`.
- No GST calculation anywhere (API returns `gst: 0`, `tax_status: not_implemented`).
- Commands run in Git Bash. Tests: `cd apps/supplier && bun run test`; typecheck `./node_modules/.bin/tsc --noEmit`.

## Review Focus
1. Wrong OTP on login must show the server message, not "Your session has expired" and must not sign out (client treats every 401 as an expired session).
2. API error bodies are objects (`error.message`); the client currently reads `data.error` as a string and would show `[object Object]`.
3. A supplier with no profile yet (`GET /supplier` 404) must land on profile creation, and creating it must work without a saved location.
4. One failing invoice fetch must not blank the whole invoices list.
5. A shop-cancelled order (`cancelled`) and an open group buy past its deadline must render sensibly (`rejected` with a note, `expired`).

## File Structure
- Create `apps/supplier/src/api/schema.d.ts` (generated), `src/lib/api/mappers.ts` + `mappers.test.ts`, `src/lib/api/live.ts`, `src/components/kn/CataloguePicker.tsx`, `src/lib/geo.ts`.
- Modify `src/lib/api/{client,service,types}.ts`, `src/routes/{catalogue,profile,demand,invoices.$id}.tsx`, `package.json`, `.github/workflows/android.yml`, `backend/app/routers/catalogue.py`, `backend/app/auth.py`.
- Create (Android) `capacitor.config.ts`, `android/` (generated), static-build config from Task 6.

---

### Task 1: Let suppliers search the shared catalogue (backend)

`GET /catalogue/products` is `require_retailer`; a supplier gets 403 and cannot pick a product to list.

**Files:**
- Modify: `backend/app/auth.py` (add `require_owner`), `backend/app/routers/catalogue.py:170-176`
- Test: `backend/tests/test_catalogue_roles.py`

**Interfaces:**
- Produces: `require_owner` dependency (any signed-in owner, retailer or supplier) in `app.auth`.

- [ ] **Step 1: Write the failing test.** Look at how an existing unit test authenticates (`grep -rn "create_access_token" backend/tests | head -3`) and mirror it. File `backend/tests/test_catalogue_roles.py`:

```python
from fastapi.testclient import TestClient

from app.auth import AuthenticatedOwner, get_current_owner, require_owner
from app.db import get_db
from app.main import app


class _Empty:
    def scalars(self, *_a, **_k):
        class R:
            def all(self_inner):
                return []

        return R()


def _client(role: str) -> TestClient:
    app.dependency_overrides[get_current_owner] = lambda: AuthenticatedOwner(
        phone="+919000000000", role=role, shop=None, supplier=None
    )
    app.dependency_overrides[get_db] = lambda: _Empty()
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_supplier_can_search_the_shared_catalogue():
    assert _client("supplier").get("/api/v1/catalogue/products?q=rice").status_code == 200


def test_retailer_can_still_search_the_shared_catalogue():
    assert _client("retailer").get("/api/v1/catalogue/products?q=rice").status_code == 200


def test_other_catalogue_routes_stay_retailer_only():
    assert _client("supplier").get("/api/v1/catalogue/barcode/890100").status_code == 403
```

- [ ] **Step 2: Run, expect FAIL** (`ImportError: require_owner`): `cd backend && ./.venv/Scripts/python -m pytest tests/test_catalogue_roles.py -q`
- [ ] **Step 3: Implement.** In `app/auth.py`, after `require_supplier`:

```python
def require_owner(owner: AuthenticatedOwner = Depends(get_current_owner)) -> AuthenticatedOwner:
    """Any signed-in owner, retailer or supplier."""
    return owner
```

In `catalogue.py` import `require_owner` and change only `list_products` (the `GET /products` handler with `q: str = Query(...)`) to `_: AuthenticatedOwner = Depends(require_owner)`.
- [ ] **Step 4: Run, expect PASS**, then `./.venv/Scripts/ruff check . && ./.venv/Scripts/python -m pytest -q` (all green).
- [ ] **Step 5: Commit** `git add backend && git commit -m "feat(catalogue): suppliers may search the shared catalogue"`.

---

### Task 2: Generated types, client error handling, type additions

**Files:**
- Modify: `apps/supplier/package.json`, `src/lib/api/client.ts`, `src/lib/api/types.ts`
- Create: `apps/supplier/src/api/schema.d.ts`
- Test: `apps/supplier/src/lib/api/client.test.ts`

**Interfaces:**
- Produces: `components` types at `@/api/schema`; `types.ts` gains `CatalogueChoice`, `ProductInput.catalogueId?`, `Invoice.taxNote?`, `DemandSignal.shopsTotal?`; `request()` throws `ApiError("validation", serverMessage, 401)` for 401 on `/auth/*` paths (no sign-out) and reads `error.message`.

- [ ] **Step 1: Install and generate.**

```bash
cd apps/supplier
bun add -d openapi-typescript
bun add -d typescript   # only if tsc is missing; skip if already present
```
Add to `package.json` scripts: `"gen:api": "openapi-typescript ../../docs/openapi.yaml -o src/api/schema.d.ts"`, then `bun run gen:api`.
- [ ] **Step 2: Write the failing test** `src/lib/api/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_API_URL", "http://api.test/api/v1");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("request (live)", () => {
  it("shows the server message for an API error object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "conflict", message: "Order is below the supplier minimum" } }, 409)));
    const { request } = await import("./client");
    await expect(request("POST", "/x", {})).rejects.toMatchObject({ kind: "conflict", message: "Order is below the supplier minimum" });
  });

  it("a wrong code is a validation error, not an expired session", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "unauthorized", message: "Invalid phone or OTP" } }, 401)));
    const { request, setUnauthorizedHandler } = await import("./client");
    setUnauthorizedHandler(onUnauthorized);
    await expect(request("POST", "/auth/otp/verify", {})).rejects.toMatchObject({ kind: "validation", message: "Invalid phone or OTP" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("a 401 elsewhere signs the supplier out", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "x" } }, 401)));
    const { request, setUnauthorizedHandler } = await import("./client");
    setUnauthorizedHandler(onUnauthorized);
    await expect(request("GET", "/supplier", undefined)).rejects.toMatchObject({ kind: "unauthorized" });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it("a 204 returns undefined", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { request } = await import("./client");
    await expect(request("POST", "/auth/otp/request", { phone: "+919000000000" })).resolves.toBeUndefined();
  });
});
```
- [ ] **Step 3: Run, expect FAIL:** `bun run test client`.
- [ ] **Step 4: Implement.** In `client.ts` replace the block after `const data = await res.json()...` with:

```ts
  const data = await res.json().catch(() => undefined);
  if (res.ok) return data as T;
  const err = (data as { error?: { message?: string } | string; message?: string } | undefined) ?? {};
  const msg =
    (typeof err.error === "object" ? err.error?.message : err.error) ?? err.message ?? `Request failed (${res.status})`;
  if (res.status === 401) {
    // a wrong sign-in code is the person's mistake, not an expired session
    if (path.startsWith("/auth/")) throw new ApiError("validation", msg, 401);
    onUnauthorized?.();
    throw new ApiError("unauthorized", "Your session has expired. Please sign in again.", 401);
  }
```
(the later `if (res.status === 404)` etc. lines stay). In `types.ts`: change `export type ProductInput = Omit<Product, "id">;` to `export type ProductInput = Omit<Product, "id"> & { catalogueId?: string };`, add `taxNote?: string;` to `Invoice`, `shopsTotal?: number;` to `DemandSignal`, and:

```ts
/** A product from the shared catalogue that a supplier can list for wholesale. */
export interface CatalogueChoice {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
}
```
- [ ] **Step 5: Run `bun run test` and `./node_modules/.bin/tsc --noEmit`: PASS.** Commit `feat(supplier): typed API schema, correct error handling`.

---

### Task 3: Mappers (API shape to app shape)

**Files:**
- Create: `apps/supplier/src/lib/api/mappers.ts`, `apps/supplier/src/lib/api/mappers.test.ts`

**Interfaces:**
- Consumes: `components` from `@/api/schema`; app types from `./types`; `ApiError` from `./client`.
- Produces (all exported): `unitLabel(unit?: string|null): string`, `productTitle(p?: Product|null): string`, `orderStatus(s?: string): OrderStatus`, `toSession(phone: string, r: {token: string; role: string}): Session`, `toSupplier(s): Supplier`, `toSupplierBody(b: Partial<SupplierInput>): Record<string, unknown>`, `toListing(sp): Product`, `toCatalogueChoice(p): CatalogueChoice`, `toListingBody(b: ProductInput)`, `toListingPatch(b: Partial<ProductInput>)`, `toOrder(o): Order`, `toInvoice(inv, order: Order): Invoice`, `toDemand(rows): DemandSignal[]`, `toGroupBuy(g, now?: number): GroupBuy`, `toGroupBuyBody(b: GroupBuyInput)`.

- [ ] **Step 1: Write the failing tests** `mappers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { components } from "@/api/schema";
import {
  orderStatus, productTitle, toCatalogueChoice, toDemand, toGroupBuy, toGroupBuyBody, toInvoice,
  toListing, toListingBody, toListingPatch, toOrder, toSession, toSupplier, toSupplierBody, unitLabel,
} from "./mappers";

type S = components["schemas"];
const as = <T,>(x: unknown) => x as T;

const rice = { id: "p1", name: "Jaya Rice", brand: "Malabar", size: "25 kg", category: "Rice", unit: "piece", barcode: "8901234" };

describe("small helpers", () => {
  it("labels units and titles", () => {
    expect(unitLabel("gram")).toBe("g");
    expect(unitLabel("piece")).toBe("pcs");
    expect(productTitle(as<S["Product"]>(rice))).toBe("Malabar Jaya Rice 25 kg");
    expect(productTitle(undefined)).toBe("Product");
  });
  it("maps order statuses, folding cancelled into rejected", () => {
    expect(orderStatus("placed")).toBe("new");
    expect(orderStatus("cancelled")).toBe("rejected");
    expect(orderStatus("delivered")).toBe("delivered");
    expect(orderStatus(undefined)).toBe("new");
  });
});

describe("session and profile", () => {
  it("keeps the phone the supplier typed", () => {
    expect(toSession("+919000000001", { token: "t", role: "supplier" })).toEqual({ token: "t", role: "supplier", phone: "+919000000001" });
  });
  it("shows the delivery radius in km and round-trips it", () => {
    const s = toSupplier(as<S["Supplier"]>({ id: "s1", name: "Malabar", contact_name: "Anil", phone: "+91900", address: "Kozhikode", delivery_radius_m: 12000, gstin: null, location: { lat: 11.2, lng: 75.8 } }));
    expect(s).toMatchObject({ id: "s1", businessName: "Malabar", contactName: "Anil", serviceArea: "12", location: { lat: 11.2, lng: 75.8 } });
    expect(s.gstin).toBeUndefined();
    expect(toSupplierBody({ businessName: "M", contactName: "A", address: "K", serviceArea: "12", gstin: "" })).toEqual({
      name: "M", contact_name: "A", address: "K", delivery_radius_m: 12000, gstin: null,
    });
  });
  it("ignores a radius that is not a positive number", () => {
    expect(toSupplierBody({ serviceArea: "abc" })).toEqual({});
    expect(toSupplierBody({ serviceArea: "0" })).toEqual({});
  });
});

describe("catalogue listings", () => {
  it("maps a wholesale listing to the app product", () => {
    const p = toListing(as<S["SupplierProduct"]>({ product: rice, price: 1150, pack_size: 25, min_order_packs: 4, available: false }));
    expect(p).toEqual({ id: "p1", sku: "8901234", name: "Malabar Jaya Rice 25 kg", category: "Rice", packSize: 25, unit: "pcs", wholesalePrice: 1150, moq: 4, active: false });
  });
  it("builds create and patch bodies", () => {
    const input = { sku: "", name: "", category: "", packSize: 12, unit: "pcs", wholesalePrice: 99.5, moq: 2, active: true, catalogueId: "p1" };
    expect(toListingBody(input)).toEqual({ product_id: "p1", price: 99.5, pack_size: 12, min_order_packs: 2, available: true });
    expect(() => toListingBody({ ...input, catalogueId: undefined })).toThrow("Choose a product");
    expect(toListingPatch({ wholesalePrice: 80, active: false })).toEqual({ price: 80, available: false });
  });
  it("shows a catalogue search result as a choice", () => {
    expect(toCatalogueChoice(as<S["Product"]>(rice))).toEqual({ id: "p1", name: "Malabar Jaya Rice 25 kg", sku: "8901234", category: "Rice", unit: "pcs" });
  });
});

const order = {
  id: "abcdef12-0000-0000-0000-000000000000", status: "placed", total: 4600,
  shop: { id: "sh1", name: "Mary Stores", address: "Kaloor", location: { lat: 9.99, lng: 76.3 } },
  items: [{ product_id: "p1", packs: 4, name: "Jaya Rice", pack_size: 25, unit_price: 1150, line_total: 4600 }],
  tracking: [{ status: "placed", at: "2026-10-12T05:00:00Z", note: null }],
  created_at: "2026-10-12T05:00:00Z",
};

describe("orders and invoices", () => {
  it("maps an order and links its invoice only once accepted", () => {
    const o = toOrder(as<S["Order"]>(order));
    expect(o).toMatchObject({
      id: order.id, reference: "PO-ABCDEF", status: "new", total: 4600,
      retailer: { name: "Mary Stores", area: "Kaloor", location: { lat: 9.99, lng: 76.3 } },
      items: [{ productId: "p1", name: "Jaya Rice", quantity: 4, packSize: 25, unitPrice: 1150 }],
      tracking: [{ status: "new", at: "2026-10-12T05:00:00Z" }],
    });
    expect(o.invoiceId).toBeUndefined();
    expect(toOrder(as<S["Order"]>({ ...order, status: "accepted" })).invoiceId).toBe(order.id);
  });
  it("shows a shop-cancelled order as rejected with a note", () => {
    const o = toOrder(as<S["Order"]>({ ...order, status: "cancelled", tracking: [{ status: "placed", at: "a" }, { status: "cancelled", at: "b", note: null }] }));
    expect(o.status).toBe("rejected");
    expect(o.tracking.at(-1)).toEqual({ status: "rejected", at: "b", note: "Cancelled by the shop" });
  });
  it("builds an invoice from the order and keeps the not-implemented GST note", () => {
    const o = toOrder(as<S["Order"]>({ ...order, status: "accepted" }));
    const i = toInvoice(as<S["Invoice"]>({ number: "INV-1", order_id: order.id, issued_at: "2026-10-12T06:00:00Z", supplier: { name: "Malabar", address: "Kozhikode", gstin: null }, subtotal: 4600, gst: 0, total: 4600, status: "unpaid", tax_note: "GST is not currently implemented." }), o);
    expect(i).toMatchObject({ id: order.id, number: "INV-1", orderReference: "PO-ABCDEF", gstRate: 0, gst: 0, total: 4600, status: "unpaid", taxNote: "GST is not currently implemented.", supplier: { businessName: "Malabar", address: "Kozhikode" } });
    expect(i.supplier.gstin).toBeUndefined();
  });
});

describe("demand and group buys", () => {
  it("shows demand as shops low or out of the shops nearby", () => {
    const rows = toDemand([{ product: as<S["Product"]>(rice), shops_low_or_out: 4, shops_total: 9 }]);
    expect(rows).toEqual([{ productName: "Malabar Jaya Rice 25 kg", category: "Rice", packSize: 0, unit: "pcs", shopCount: 4, shopsTotal: 9, totalPacks: 0, period: "" }]);
  });
  it("maps a group buy and calls an open one past its deadline expired", () => {
    const g = as<S["GroupBuy"]>({ id: "g1", product: rice, pack_size: 25, tiers: [{ min_packs: 10, price: 1000 }], pooled_packs: 6, shops_joined: 2, current_price: 1100, deadline: "2026-10-12T10:00:00Z", status: "open" });
    expect(toGroupBuy(g, Date.parse("2026-10-12T09:00:00Z"))).toMatchObject({ id: "g1", productId: "p1", productName: "Malabar Jaya Rice 25 kg", packSize: 25, unit: "pcs", status: "open", committedPacks: 6, participantCount: 2, tiers: [{ minPacks: 10, price: 1000 }] });
    expect(toGroupBuy(g, Date.parse("2026-10-12T11:00:00Z")).status).toBe("expired");
    expect(toGroupBuy({ ...g, status: "confirmed" }, Date.parse("2026-10-12T11:00:00Z")).status).toBe("confirmed");
  });
  it("builds the create body", () => {
    expect(toGroupBuyBody({ productId: "p1", deadline: "2026-10-13T00:00:00.000Z", tiers: [{ minPacks: 10, price: 1000 }] })).toEqual({ product_id: "p1", deadline: "2026-10-13T00:00:00.000Z", tiers: [{ min_packs: 10, price: 1000 }] });
  });
});
```
- [ ] **Step 2: Run, expect FAIL** (module not found): `bun run test mappers`.
- [ ] **Step 3: Implement `mappers.ts`:**

```ts
import type { components } from "@/api/schema";
import { ApiError } from "./client";
import type {
  CatalogueChoice, DemandSignal, GroupBuy, GroupBuyInput, Invoice, Order, OrderStatus, Product,
  ProductInput, Session, Supplier, SupplierInput,
} from "./types";

type S = components["schemas"];

export const unitLabel = (unit?: string | null) => (unit === "gram" ? "g" : "pcs");
export const productTitle = (p?: S["Product"] | null) =>
  [p?.brand, p?.name, p?.size].filter(Boolean).join(" ") || "Product";

const ORDER_STATUS: Record<string, OrderStatus> = {
  placed: "new", accepted: "accepted", rejected: "rejected", cancelled: "rejected",
  dispatched: "dispatched", delivered: "delivered",
};
export const orderStatus = (s?: string): OrderStatus => ORDER_STATUS[s ?? ""] ?? "new";
const HAS_INVOICE = new Set<OrderStatus>(["accepted", "dispatched", "delivered"]);

export const toSession = (phone: string, r: { token: string; role: string }): Session => ({
  token: r.token, role: r.role, phone,
});

export function toSupplier(s: S["Supplier"]): Supplier {
  return {
    id: s.id ?? "",
    businessName: s.name ?? "",
    contactName: s.contact_name ?? "",
    phone: s.phone ?? "",
    ...(s.gstin ? { gstin: s.gstin } : {}),
    address: s.address ?? "",
    serviceArea: s.delivery_radius_m ? String(Math.round(s.delivery_radius_m / 1000)) : "",
    ...(s.location ? { location: { lat: s.location.lat, lng: s.location.lng } } : {}),
  };
}

export function toSupplierBody(b: Partial<SupplierInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (b.businessName !== undefined) out["name"] = b.businessName;
  if (b.contactName !== undefined) out["contact_name"] = b.contactName;
  if (b.address !== undefined) out["address"] = b.address;
  if (b.gstin !== undefined) out["gstin"] = b.gstin || null;
  if (b.serviceArea !== undefined) {
    const km = Number(b.serviceArea);
    if (Number.isFinite(km) && km > 0) out["delivery_radius_m"] = Math.round(km * 1000);
  }
  if (b.location) out["location"] = b.location;
  return out;
}

export function toListing(sp: S["SupplierProduct"]): Product {
  const p = sp.product;
  return {
    id: p?.id ?? "",
    sku: p?.barcode ?? "—",
    name: productTitle(p),
    category: p?.category ?? "",
    packSize: sp.pack_size ?? 1,
    unit: unitLabel(p?.unit),
    wholesalePrice: sp.price ?? 0,
    moq: sp.min_order_packs ?? 1,
    active: sp.available ?? true,
  };
}

export const toCatalogueChoice = (p: S["Product"]): CatalogueChoice => ({
  id: p.id ?? "", name: productTitle(p), sku: p.barcode ?? "—", category: p.category ?? "", unit: unitLabel(p.unit),
});

export function toListingBody(b: ProductInput) {
  if (!b.catalogueId) throw new ApiError("validation", "Choose a product from the catalogue first.");
  return {
    product_id: b.catalogueId, price: b.wholesalePrice, pack_size: Math.round(b.packSize),
    min_order_packs: b.moq, available: b.active,
  };
}

export function toListingPatch(b: Partial<ProductInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (b.wholesalePrice !== undefined) out["price"] = b.wholesalePrice;
  if (b.packSize !== undefined) out["pack_size"] = Math.round(b.packSize);
  if (b.moq !== undefined) out["min_order_packs"] = b.moq;
  if (b.active !== undefined) out["available"] = b.active;
  return out;
}

export function toOrder(o: S["Order"]): Order {
  const id = o.id ?? "";
  const status = orderStatus(o.status);
  const loc = o.shop?.location;
  return {
    id,
    reference: `PO-${id.slice(0, 6).toUpperCase()}`,
    retailer: {
      name: o.shop?.name ?? "Shop",
      area: o.shop?.address ?? "",
      ...(loc ? { location: { lat: loc.lat ?? null, lng: loc.lng ?? null } } : {}),
    },
    items: (o.items ?? []).map((l) => ({
      productId: l.product_id, name: l.name ?? "Item", sku: "", packSize: l.pack_size ?? 1,
      unit: "units", quantity: l.packs, unitPrice: l.unit_price ?? 0,
    })),
    total: o.total ?? 0,
    status,
    createdAt: o.created_at ?? "",
    tracking: (o.tracking ?? []).map((t) => ({
      status: orderStatus(t.status),
      at: t.at ?? "",
      ...(t.note ? { note: t.note } : t.status === "cancelled" ? { note: "Cancelled by the shop" } : {}),
    })),
    ...(HAS_INVOICE.has(status) ? { invoiceId: id } : {}),
  };
}

export function toInvoice(inv: S["Invoice"], order: Order): Invoice {
  return {
    id: order.id,
    number: inv.number ?? "",
    orderId: order.id,
    orderReference: order.reference,
    issuedAt: inv.issued_at ?? order.createdAt,
    supplier: {
      businessName: inv.supplier?.name ?? "",
      address: inv.supplier?.address ?? "",
      ...(inv.supplier?.gstin ? { gstin: inv.supplier.gstin } : {}),
    },
    retailer: order.retailer,
    lines: order.items,
    subtotal: inv.subtotal ?? order.total,
    gstRate: 0,
    gst: inv.gst ?? 0,
    total: inv.total ?? order.total,
    ...(inv.status ? { status: inv.status } : {}),
    ...(inv.tax_note ? { taxNote: inv.tax_note } : {}),
  };
}

export function toDemand(rows: { product?: S["Product"]; shops_low_or_out?: number; shops_total?: number }[]): DemandSignal[] {
  return rows.map((r) => ({
    productName: productTitle(r.product),
    category: r.product?.category ?? "",
    packSize: 0,
    unit: unitLabel(r.product?.unit),
    shopCount: r.shops_low_or_out ?? 0,
    shopsTotal: r.shops_total ?? 0,
    totalPacks: 0,
    period: "",
  }));
}

export function toGroupBuy(g: S["GroupBuy"], now = Date.now()): GroupBuy {
  const deadline = g.deadline ?? "";
  const pastDeadline = deadline !== "" && Date.parse(deadline) <= now;
  return {
    id: g.id ?? "",
    productId: g.product?.id ?? "",
    productName: productTitle(g.product),
    packSize: g.pack_size ?? 1,
    unit: unitLabel(g.product?.unit),
    deadline,
    status: g.status === "open" && pastDeadline ? "expired" : (g.status ?? "open"),
    tiers: (g.tiers ?? []).map((t) => ({ minPacks: t.min_packs, price: t.price })),
    ...(g.pooled_packs !== undefined ? { committedPacks: g.pooled_packs } : {}),
    ...(g.shops_joined !== undefined ? { participantCount: g.shops_joined } : {}),
  };
}

export const toGroupBuyBody = (b: GroupBuyInput) => ({
  product_id: b.productId,
  deadline: b.deadline,
  tiers: b.tiers.map((t) => ({ min_packs: t.minPacks, price: t.price })),
});
```
- [ ] **Step 4: Run tests + tsc: PASS.** If tsc flags a schema field type (e.g. `loc.lat` is `number` not nullable, or `Order.items[].product_id` optional), adjust the mapper line, not the test expectations. Commit `feat(supplier): API to app mappers`.

---

### Task 4: Live API and service switch

**Files:**
- Create: `apps/supplier/src/lib/api/live.ts`
- Modify: `apps/supplier/src/lib/api/service.ts`
- Test: `apps/supplier/src/lib/api/live.test.ts`

**Interfaces:**
- Consumes: Task 2 `request`, Task 3 mappers.
- Produces: `liveApi` with exactly the keys of the existing `api` object; `searchCatalogue(q: string): Promise<CatalogueChoice[]>` exported from `service.ts`; `api` in `service.ts` is `liveApi` when `!IS_DEMO`.

- [ ] **Step 1: Failing test** `live.test.ts` (stubs `fetch`, imports `live` after setting `VITE_API_URL`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const order = (id: string, status: string) => ({ id, status, total: 100, shop: { name: "S", address: "A" }, items: [], tracking: [], created_at: "2026-10-12T05:00:00Z" });

beforeEach(() => { vi.resetModules(); vi.stubEnv("VITE_API_URL", "http://api.test/api/v1"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("liveApi", () => {
  it("signs in as a supplier and keeps the typed phone", async () => {
    const f = vi.fn().mockResolvedValue(json({ token: "t", role: "supplier", shop: null, supplier: null }));
    vi.stubGlobal("fetch", f);
    const { liveApi } = await import("./live");
    expect(await liveApi.verifyOtp("+919000000001", "123456")).toEqual({ token: "t", role: "supplier", phone: "+919000000001" });
    const sent = f.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(sent.body))).toEqual({ phone: "+919000000001", otp: "123456", role: "supplier" });
  });

  it("requesting a code resolves even though the API answers 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { liveApi } = await import("./live");
    await expect(liveApi.requestOtp("+919000000001")).resolves.toEqual({ sent: true });
  });

  it("lists invoices only for accepted orders and survives one failing invoice", async () => {
    const f = vi.fn(async (req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.endsWith("/supplier/orders")) return json({ items: [order("o1", "accepted"), order("o2", "placed"), order("o3", "delivered")] });
      if (url.endsWith("/supplier/orders/o1/invoice")) return json({ number: "INV-1", order_id: "o1", subtotal: 100, gst: 0, total: 100, status: "unpaid" });
      if (url.endsWith("/supplier/orders/o3/invoice")) return json({ error: { message: "boom" } }, 500);
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", f);
    const { liveApi } = await import("./live");
    const list = await liveApi.listInvoices();
    expect(list.map((i) => i.number)).toEqual(["INV-1"]);
  });
});
```
(`request()` calls `fetch(url, init)` with a string URL, so `req` is a string; the helper handles both.)
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `live.ts`:**

```ts
import type { components } from "@/api/schema";
import { request } from "./client";
import {
  toCatalogueChoice, toDemand, toGroupBuy, toGroupBuyBody, toInvoice, toListing, toListingBody,
  toListingPatch, toOrder, toSession, toSupplier, toSupplierBody,
} from "./mappers";
import type { CatalogueChoice, GroupBuyInput, OrderStatus, ProductInput, SupplierInput } from "./types";

type S = components["schemas"];
type List<T> = { items?: T[] };

const apiStatus = (s: OrderStatus) => s; // app and API use the same words for every move a supplier can make

export const liveApi = {
  requestOtp: async (phone: string) => {
    await request<unknown>("POST", "/auth/otp/request", { phone });
    return { sent: true as boolean, resendAfterSeconds: 30 };
  },
  verifyOtp: async (phone: string, otp: string) =>
    toSession(phone, await request<{ token: string; role: string }>("POST", "/auth/otp/verify", { phone, otp, role: "supplier" })),

  getSupplier: async () => toSupplier(await request<S["Supplier"]>("GET", "/supplier")),
  createSupplier: async (b: SupplierInput) => toSupplier(await request<S["Supplier"]>("POST", "/supplier", toSupplierBody(b))),
  updateSupplier: async (b: Partial<SupplierInput>) => toSupplier(await request<S["Supplier"]>("PATCH", "/supplier", toSupplierBody(b))),

  listProducts: async () => (await request<List<S["SupplierProduct"]>>("GET", "/supplier/products")).items?.map(toListing) ?? [],
  createProduct: async (b: ProductInput) =>
    toListing(await request<S["SupplierProduct"]>("POST", "/supplier/products", toListingBody(b))),
  updateProduct: async (id: string, b: Partial<ProductInput>) =>
    toListing(await request<S["SupplierProduct"]>("PATCH", `/supplier/products/${id}`, toListingPatch(b))),

  listOrders: async () => (await request<List<S["Order"]>>("GET", "/supplier/orders")).items?.map(toOrder) ?? [],
  setOrderStatus: async (id: string, status: OrderStatus, note?: string) =>
    toOrder(await request<S["Order"]>("POST", `/supplier/orders/${id}/status`, { status: apiStatus(status), ...(note ? { note } : {}) })),

  listInvoices: async () => {
    const orders = await liveApi.listOrders();
    const billed = orders.filter((o) => o.invoiceId);
    const settled = await Promise.allSettled(
      billed.map(async (o) => toInvoice(await request<S["Invoice"]>("GET", `/supplier/orders/${o.id}/invoice`), o)),
    );
    return settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  },

  listDemand: async () => toDemand((await request<List<{ product?: S["Product"]; shops_low_or_out?: number; shops_total?: number }>>("GET", "/supplier/demand")).items ?? []),

  listGroupBuys: async () => (await request<List<S["GroupBuy"]>>("GET", "/supplier/group-buys")).items?.map((g) => toGroupBuy(g)) ?? [],
  createGroupBuy: async (b: GroupBuyInput) => toGroupBuy(await request<S["GroupBuy"]>("POST", "/supplier/group-buys", toGroupBuyBody(b))),
};

export const liveSearchCatalogue = async (q: string): Promise<CatalogueChoice[]> =>
  (await request<List<S["Product"]>>("GET", `/catalogue/products?q=${encodeURIComponent(q)}`)).items?.map(toCatalogueChoice) ?? [];
```
In `service.ts`: rename the existing `export const api = {` to `const demoApi = {`, update imports, and add after it (before `export const q`):

```ts
import { IS_DEMO } from "./client";
import { liveApi, liveSearchCatalogue } from "./live";
import type { CatalogueChoice } from "./types";

export const api: typeof demoApi = IS_DEMO ? demoApi : (liveApi as unknown as typeof demoApi);
export const searchCatalogue = (text: string): Promise<CatalogueChoice[]> =>
  IS_DEMO ? Promise.resolve([]) : liveSearchCatalogue(text);
```
(merge the import lines with the existing `import { request } from "./client";`). Replace `api.listDemand` etc. in `q` unchanged (they read `api`).
- [ ] **Step 4: Run tests + tsc: PASS.** If `typeof demoApi` cast hides a real signature mismatch, remove the `as unknown as` cast and fix the differing types instead.
- [ ] **Step 5: Commit** `feat(supplier): live API behind the existing api object`.

---

### Task 5: Screens

**Files:**
- Create: `apps/supplier/src/components/kn/CataloguePicker.tsx`, `apps/supplier/src/lib/geo.ts`
- Modify: `src/routes/catalogue.tsx`, `src/routes/profile.tsx`, `src/routes/demand.tsx`, `src/routes/invoices.$id.tsx`

**Interfaces:**
- Consumes: `searchCatalogue`, `IS_DEMO`, `CatalogueChoice`.
- Produces: `currentLocation(): Promise<{lat:number;lng:number}|null>`.

- [ ] **Step 1: `src/lib/geo.ts`**

```ts
/** Best-effort device location. Resolves null when unavailable, denied or slow. */
export function currentLocation(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
```
- [ ] **Step 2: `CataloguePicker.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Package, Search } from "lucide-react";
import { searchCatalogue } from "@/lib/api/service";
import type { CatalogueChoice } from "@/lib/api/types";

export function CataloguePicker({ onPick }: { onPick: (c: CatalogueChoice) => void }) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const results = useQuery({ queryKey: ["catalogue-search", term], queryFn: () => searchCatalogue(term), enabled: term.length >= 2 });

  return (
    <div className="space-y-3">
      <label className="flex min-h-12 items-center gap-2 rounded-full bg-card px-[18px]">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Search the product catalogue</span>
        <input
          autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name or brand"
          className="min-h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </label>
      {term.length < 2 ? (
        <p className="text-sm text-muted-foreground">Type at least 2 letters to find a product from the shared catalogue.</p>
      ) : results.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</p>
      ) : results.isError ? (
        <p className="text-sm font-medium text-destructive" role="alert">Couldn't search the catalogue. Try again.</p>
      ) : !results.data?.length ? (
        <p className="text-sm text-muted-foreground">No catalogue product matches “{term}”.</p>
      ) : (
        <div className="list-surface max-h-[40dvh] overflow-y-auto">
          {results.data.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c)} className="product-row w-full text-left hover:bg-secondary/50">
              <div className="product-art"><Package className="h-[21px] w-[21px]" aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <div className="product-name truncate">{c.name}</div>
                <div className="product-sub">{c.category || "Uncategorised"} · {c.sku}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```
- [ ] **Step 3: `catalogue.tsx` ProductDialog.** Add imports `IS_DEMO` from `@/lib/api/client`, `CataloguePicker`, and `CatalogueChoice`. Inside `ProductDialog` add before `const initial`:

```tsx
  const live = !IS_DEMO;
  const [choice, setChoice] = useState<CatalogueChoice | null>(null);
  const locked = live; // the API only edits price, pack size, minimum and availability
```
Change `initial` so a picked choice pre-fills the identity fields:

```tsx
  const initial: ProductInput = product
    ? { ...product }
    : choice
      ? { ...EMPTY, sku: choice.sku, name: choice.name, category: choice.category, unit: choice.unit, catalogueId: choice.id }
      : EMPTY;
  const [v, setV] = useState<ProductInput>(initial);
```
and after `setChoice` is called the state must refresh: replace the `useState<ProductInput>(initial)` by keeping it, and make the picker handler `onPick={(c) => { setChoice(c); setV({ ...EMPTY, sku: c.sku, name: c.name, category: c.category, unit: c.unit, catalogueId: c.id }); }}`.
In `field(...)`, add `disabled` for the identity keys when locked: `disabled={locked && (k === "name" || k === "sku" || k === "category" || k === "unit")}` (placed before `{...props}`). In the dialog body, when `live && !product && !choice`, render `<CataloguePicker onPick=... />` and a Cancel button instead of the `<form>`; otherwise the existing form. `validate` is unchanged.
- [ ] **Step 4: `profile.tsx`.** Import `IS_DEMO`, `currentLocation`. Change FIELDS label: `{ k: "serviceArea", label: IS_DEMO ? "Service area" : "Delivery radius (km)" }`. In `submit()` add after the required-field loop: `if (!IS_DEMO && v.serviceArea && !(Number(v.serviceArea) > 0)) e["serviceArea"] = "Enter the distance you deliver, in km.";`. Change the mutation:

```tsx
    mutationFn: async () => {
      if (missing) {
        const location = IS_DEMO ? null : await currentLocation();
        return api.createSupplier(location ? { ...v, location } : v);
      }
      const patch = Object.fromEntries(changed.map((k) => [k, v[k]]));
      return api.updateSupplier(patch);
    },
```
- [ ] **Step 5: `demand.tsx`.** Replace the two lines inside the row:

```tsx
                <div className="product-sub">
                  {d.shopsTotal !== undefined ? d.category : `${d.category} · ${pack(d.packSize, d.unit)} packs · ${d.period}`}
                </div>
```
and the right-hand block:

```tsx
              <div className="text-right">
                {d.shopsTotal !== undefined ? (
                  <div className="product-name tabular">{d.shopCount} of {d.shopsTotal} shops</div>
                ) : (
                  <div className="product-name tabular">{d.totalPacks} packs</div>
                )}
                <Pill tone="neutral">{d.shopsTotal !== undefined ? "low or out of stock" : shopBand(d.shopCount)}</Pill>
              </div>
```
Also change the row `key` to `d.productName + d.unit + d.packSize`.
- [ ] **Step 6: `invoices.$id.tsx`.** Replace the demo banner text with `{i.taxNote ?? "…existing text…"}` (keep the bold "Demo document." prefix) and the GST row with:

```tsx
          <div className="flex justify-between text-muted-foreground">
            <span>{i.taxNote ? "GST (not implemented)" : `GST (illustrative flat ${Math.round(i.gstRate * 100)}%)`}</span><span className="tabular">{inr(i.gst)}</span>
          </div>
```
- [ ] **Step 7: Verify.** `./node_modules/.bin/tsc --noEmit && bun run test && bun run build` pass. Commit `feat(supplier): catalogue picker, delivery radius, demand and invoice copy for the live API`.

---

### Task 6: Spike: static SPA build for Capacitor

The supplier app builds as SSR (nitro, Cloudflare target); Capacitor needs `index.html` plus assets.

**Files:** `apps/supplier/vite.config.ts` (or new `vite.android.config.ts`), `apps/supplier/package.json`.

- [ ] **Step 1: Try TanStack Start SPA mode.** In `vite.config.ts` add under `tanstackStart`: `spa: { enabled: true }` (check the installed `@tanstack/react-start` docs in `node_modules/@tanstack/react-start` for the exact option name) and run `bun run build`. Look for `dist/client/index.html` (`ls dist/client | head`).
- [ ] **Step 2: Decide.**
  - If `index.html` exists and `bun run preview` (or `npx serve dist/client`) loads the app and routes work: keep it, `webDir: "dist/client"`. Confirm the Lovable web build still works (`bun run build` is the same command).
  - If not: create `vite.android.config.ts` + `index.html` + `src/main.android.tsx` mirroring `apps/retailer/vite.config.ts` and `apps/retailer/src/main.tsx` (plain Vite + `tanstackRouter` plugin with its own `routeTree.android.gen.ts`, importing the same route files), add script `"build:android": "vite build --config vite.android.config.ts"`. Expect `__root.tsx` (`HeadContent`, `Scripts`, shell component) to need an SPA-safe variant; report to Adnan before rewriting it, because Shreyas owns that file.
- [ ] **Step 3: Report the finding in the PR description (which option, why). Commit the config.**

---

### Task 7: Capacitor shell and CI

**Files:** `apps/supplier/{package.json,capacitor.config.ts,android/**}`, `.github/workflows/android.yml`

- [ ] **Step 1: Install and scaffold** (versions as the retailer app):

```bash
cd apps/supplier
bun add @capacitor/core@^8.5.3 @capacitor/android@^8.5.3
bun add -d @capacitor/cli@^8.5.3
```
`capacitor.config.ts` (copy `apps/retailer/capacitor.config.ts`, change `appId` to `com.kannect.supplier`, `appName` to `Kannect Supplier`, `webDir` to the Task 6 output). Add scripts `"android:sync": "<build command from Task 6> && cap sync android"`, `"android:open": "cap open android"`, `"android:apk": "bun run android:sync && cd android && ./gradlew assembleDebug"`. Then `bunx cap add android`.
- [ ] **Step 2: Permissions.** Compare `apps/retailer/android/app/src/main/AndroidManifest.xml` with the supplier's; add `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` (used by profile creation and the route map). Copy the same safe-area / status-bar plugin setup the retailer uses (`SystemBars` in the config).
- [ ] **Step 3: CI.** In `.github/workflows/android.yml` change the matrix to `app: [retailer, consumer, supplier]` and add `- "apps/supplier/**"` to the `pull_request.paths`.
- [ ] **Step 4: Verify locally if Java 21 + Android SDK exist** (`cd android && ./gradlew assembleDebug`); otherwise rely on CI. Fix `bun.lock` with `bun install` in `apps/supplier` (CI uses `--frozen-lockfile`); do not commit `package-lock.json`.
- [ ] **Step 5: Commit** `feat(supplier): Capacitor Android app and CI APK job`.

---

### Task 8: End-to-end test, all three apps

**Files:** `backend/scripts/try_supplier_flow.py` (new, dev-only script)

- [ ] **Step 1: Environment.** `docker compose up -d` (api on 8000, `OTP_PROVIDER=demo` in `backend/.env`; migration at head). Start the supplier app: `cd apps/supplier && VITE_API_URL=http://localhost:8000/api/v1 bun run dev --port 8081 --strictPort` (CORS allows 5173 and 8080; check `CORS_ORIGINS` in `backend/.env` and add `http://localhost:8081` there if the browser shows CORS errors).
- [ ] **Step 2: Script that plays the retailer** (sign in with a demo retailer number from `docs/run-locally.md`, place an order with the supplier's listing). `backend/scripts/try_supplier_flow.py`:

```python
"""Plays a retailer placing an order with a supplier, against a running API (default localhost)."""

import json
import sys
import urllib.request
import uuid

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/api/v1"
RETAILER_PHONE = sys.argv[2] if len(sys.argv) > 2 else "+919000000001"
OTP = sys.argv[3] if len(sys.argv) > 3 else "123456"


def call(method, path, body=None, token=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


session = call("POST", "/auth/otp/verify", {"phone": RETAILER_PHONE, "otp": OTP, "role": "retailer"})
token = session["token"]
suppliers = call("GET", "/suppliers", token=token)["items"]
if not suppliers:
    sys.exit("no supplier serves this shop yet: create the supplier profile in the app first (needs a location)")
supplier = suppliers[0]
listing = call("GET", f"/suppliers/{supplier['id']}/products", token=token)["items"]
if not listing:
    sys.exit("the supplier has no listed products yet")
line = listing[0]
order = call("POST", "/orders", {
    "client_id": str(uuid.uuid4()),
    "supplier_id": supplier["id"],
    "items": [{"product_id": line["product"]["id"], "packs": max(line.get("min_order_packs") or 1, 1)}],
}, token=token)
print("placed order", order["id"], "status", order["status"])
```
If a call fails (shop with no location, supplier radius), print the server message and fix the setup, not the script.
- [ ] **Step 3: Drive the supplier UI in Chrome** (claude-in-chrome): sign in with a fresh number + demo OTP; create the profile (allow location, or note the missing location); add a product via the catalogue picker; run the script; in the app accept, dispatch, deliver the order; open the invoice; open demand (may be empty: fewer than 3 shops); create a group buy; wrong OTP shows the server message and stays on the form. Record results in the PR.
- [ ] **Step 4: Retailer and consumer smoke.** Run each app's tests (`bun run test`); in Chrome: retailer demo login with any number + demo OTP; consumer search, reserve, status page.
- [ ] **Step 5: Against Render** after the deploy: repeat the supplier login + profile + product + order flow once with `VITE_API_URL=https://kannect-i9bp.onrender.com/api/v1` (open `/api/v1/health` first for the cold start). Needs Render's `OTP_PROVIDER=demo`.
- [ ] **Step 6: Commit the script**, push, open the PR, wait for CI (backend, spec, integration, 3 APK jobs), merge when green, add the APKs to `D:\Adnan\50soc\apk\`, and append a handoff note (`D:\Adnan\50soc\docs\handoffs\`).

---

## Self-review
- Spec coverage: typed layer (T2), adapter (T3-4), screen changes (login role in T4 `verifyOtp`, catalogue/profile/demand/invoices T5, group buys via mapper since `productId` is the catalogue id, orders via mapper), Android + CI (T6-7), backend gap (T1), testing (T3-4 unit, T8 e2e/Render), docs/handoff (T8).
- Names: `catalogueId`, `taxNote`, `shopsTotal`, `CatalogueChoice`, `searchCatalogue`, `liveApi`, `currentLocation` are defined in T2/T4/T5 and used consistently.
- Known risks: Task 6 may need a root-route change owned by Shreyas (report before doing it); supplier location may be missing if geolocation is denied (route map then simply lacks the supplier pin; `GET /suppliers` filters by area, so the e2e script may find no supplier: set a location through the profile or SQL for the test).
