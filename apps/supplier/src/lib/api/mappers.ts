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

export const toSession = (
  phone: string,
  r: { token: string; role: string; supplier?: unknown },
): Session => ({ token: r.token, role: r.role, phone, hasProfile: r.supplier != null });

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
