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
    expect(toSession("+919000000001", { token: "t", role: "supplier", supplier: { id: "s1" } })).toEqual({ token: "t", role: "supplier", phone: "+919000000001", hasProfile: true });
  });
  it("notes when the supplier has not made a profile yet", () => {
    expect(toSession("+919000000001", { token: "t", role: "supplier", supplier: null }).hasProfile).toBe(false);
    expect(toSession("+919000000001", { token: "t", role: "supplier" }).hasProfile).toBe(false);
  });
  it("sends a captured location with the profile body", () => {
    expect(toSupplierBody({ location: { lat: 9.9, lng: 76.3 } })).toEqual({ location: { lat: 9.9, lng: 76.3 } });
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
    const { catalogueId: _unused, ...noChoice } = input;
    expect(() => toListingBody(noChoice)).toThrow("Choose a product");
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
