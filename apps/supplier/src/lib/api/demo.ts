// DEMO FIXTURES — used only when VITE_API_URL is not configured.
// Everything here is sample data and is labelled as such in the UI.
import { ILLUSTRATIVE_GST_RATE, canTransition } from "../rules";
import type {
  DemandSignal,
  GroupBuy,
  GroupBuyInput,
  Invoice,
  Order,
  OrderStatus,
  Product,
  Supplier,
} from "./types";

class DemoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const DEMO_OTP = "123456";

const h = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
const d = (daysAhead: number) => new Date(Date.now() + daysAhead * 86400_000).toISOString();

let supplier: Supplier | null = {
  id: "sup_demo",
  businessName: "Malabar Wholesale Traders (Demo)",
  contactName: "Anil Kumar",
  phone: "+91 98470 00000",
  gstin: "",
  address: "Market Road, Kozhikode",
  serviceArea: "Kozhikode city",
};

const seedProducts: Product[] = [
  { id: "p1", sku: "RIC-JAY-25", name: "Jaya Rice", category: "Rice", packSize: 25, unit: "kg", wholesalePrice: 1150, moq: 4, active: true },
  { id: "p2", sku: "OIL-CCN-15", name: "Coconut Oil", category: "Oils", packSize: 15, unit: "L", wholesalePrice: 2850, moq: 2, active: true },
  { id: "p3", sku: "SUG-WHT-50", name: "Sugar", category: "Staples", packSize: 50, unit: "kg", wholesalePrice: 2100, moq: 1, active: true },
  { id: "p4", sku: "TEA-DST-10", name: "Tea Dust", category: "Beverages", packSize: 10, unit: "kg", wholesalePrice: 2600, moq: 1, active: true },
  { id: "p5", sku: "ATT-WHL-10", name: "Whole Wheat Atta", category: "Flour", packSize: 10, unit: "kg", wholesalePrice: 420, moq: 5, active: false },
];
let products = seedProducts;
const [P1, P2, P3, P4] = seedProducts as [Product, Product, Product, Product, Product];

const item = (p: Product, q: number) => ({
  productId: p.id, name: p.name, sku: p.sku, packSize: p.packSize, unit: p.unit, quantity: q, unitPrice: p.wholesalePrice,
});
const mkOrder = (id: string, ref: string, shop: string, area: string, items: ReturnType<typeof item>[], status: OrderStatus, createdH: number, tracking: Order["tracking"]): Order => ({
  id, reference: ref, retailer: { name: shop, area }, items,
  total: items.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
  status, createdAt: h(createdH), tracking,
});

let orders: Order[] = [
  mkOrder("o1", "PO-1042", "Sample Store A", "Nadakkavu", [item(P1, 6), item(P3, 2)], "new", 0.5, [{ status: "new", at: h(0.5) }]),
  mkOrder("o2", "PO-1041", "Sample Store B", "Mavoor Road", [item(P2, 3)], "new", 2, [{ status: "new", at: h(2) }]),
  mkOrder("o3", "PO-1038", "Sample Store C", "Palayam", [item(P4, 2), item(P1, 4)], "accepted", 20, [{ status: "new", at: h(22) }, { status: "accepted", at: h(20) }]),
  mkOrder("o4", "PO-1035", "Sample Store A", "Nadakkavu", [item(P3, 1)], "dispatched", 30, [{ status: "new", at: h(34) }, { status: "accepted", at: h(32) }, { status: "dispatched", at: h(30), note: "Left warehouse (demo)" }]),
  mkOrder("o5", "PO-1029", "Sample Store D", "Beach Road", [item(P2, 2)], "delivered", 72, [{ status: "new", at: h(80) }, { status: "accepted", at: h(78) }, { status: "dispatched", at: h(76) }, { status: "delivered", at: h(72) }]),
  mkOrder("o6", "PO-1027", "Sample Store E", "Chevayur", [item(P1, 1)], "rejected", 96, [{ status: "new", at: h(98) }, { status: "rejected", at: h(96), note: "Below minimum order" }]),
];

let invoices: Invoice[] = [];
function makeInvoice(o: Order) {
  const subtotal = o.total;
  const gst = Math.round(subtotal * ILLUSTRATIVE_GST_RATE * 100) / 100;
  const inv: Invoice = {
    id: `inv_${o.id}`, number: `DEMO-INV-${o.reference.slice(3)}`, orderId: o.id, orderReference: o.reference,
    issuedAt: o.tracking.find((t) => t.status === "accepted")?.at ?? new Date().toISOString(),
    supplier: { businessName: supplier?.businessName ?? "", address: supplier?.address ?? "", ...(supplier?.gstin ? { gstin: supplier.gstin } : {}) },
    retailer: o.retailer, lines: o.items, subtotal, gstRate: ILLUSTRATIVE_GST_RATE, gst, total: subtotal + gst,
    status: o.status === "delivered" ? "paid" : "unpaid",
  };
  invoices.push(inv);
  o.invoiceId = inv.id;
}
orders.filter((o) => ["accepted", "dispatched", "delivered"].includes(o.status)).forEach(makeInvoice);

const demand: (DemandSignal & { shops?: string[] })[] = [
  { productName: "Jaya Rice", category: "Rice", packSize: 25, unit: "kg", shopCount: 14, totalPacks: 96, period: "Last 30 days" },
  { productName: "Coconut Oil", category: "Oils", packSize: 15, unit: "L", shopCount: 7, totalPacks: 31, period: "Last 30 days" },
  { productName: "Toor Dal", category: "Pulses", packSize: 30, unit: "kg", shopCount: 4, totalPacks: 12, period: "Last 30 days" },
  { productName: "Cardamom", category: "Spices", packSize: 1, unit: "kg", shopCount: 2, totalPacks: 3, period: "Last 30 days" },
];

let groupBuys: GroupBuy[] = [
  { id: "g1", productId: "p1", productName: "Jaya Rice", packSize: 25, unit: "kg", deadline: d(4), status: "open", tiers: [{ minPacks: 20, price: 1120 }, { minPacks: 50, price: 1090 }], committedPacks: 26, participantCount: 6 },
  { id: "g2", productId: "p4", productName: "Tea Dust", packSize: 10, unit: "kg", deadline: d(-6), status: "confirmed", tiers: [{ minPacks: 10, price: 2520 }], committedPacks: 14, participantCount: 5 },
];

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const wait = () => new Promise((r) => setTimeout(r, 350 + Math.random() * 300));
let seq = 100;

async function route(method: string, path: string, body: any): Promise<unknown> {
  const m = (re: RegExp) => path.match(re);
  if (method === "POST" && path === "/auth/otp/request") {
    if (!/^\+91\d{10}$/.test(body?.phone)) throw new DemoError(422, "Enter a valid 10-digit mobile number.");
    return { sent: true, resendAfterSeconds: 30 };
  }
  if (method === "POST" && path === "/auth/otp/verify") {
    if (body?.otp === "000000") throw new DemoError(410, "This code has expired. Request a new one.");
    if (body?.otp !== DEMO_OTP) throw new DemoError(401, "That code is incorrect. Check and try again.");
    return { token: "demo-token", role: "supplier", phone: body.phone };
  }
  if (path === "/supplier") {
    if (method === "GET") { if (!supplier) throw new DemoError(404, "No supplier profile yet."); return supplier; }
    if (method === "POST") { supplier = { id: "sup_demo", phone: "+91 98470 00000", ...body }; return supplier; }
    if (method === "PATCH") { if (!supplier) throw new DemoError(404, "No profile"); supplier = { ...supplier, ...body }; return supplier; }
  }
  if (path === "/supplier/products") {
    if (method === "GET") return products;
    if (method === "POST") {
      if (products.some((p) => p.sku === body.sku)) throw new DemoError(409, "A product with this SKU already exists.");
      const p = { ...body, id: `p${++seq}` }; products = [p, ...products]; return p;
    }
  }
  let mm = m(/^\/supplier\/products\/(\w+)$/);
  if (mm && method === "PATCH") {
    const p = products.find((x) => x.id === mm![1]); if (!p) throw new DemoError(404, "Product not found.");
    Object.assign(p, body); return p;
  }
  if (path === "/supplier/orders" && method === "GET")
    return [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  mm = m(/^\/supplier\/orders\/(\w+)\/status$/);
  if (mm && method === "POST") {
    const o = orders.find((x) => x.id === mm![1]); if (!o) throw new DemoError(404, "Order not found.");
    if (!canTransition(o.status, body.status)) throw new DemoError(409, `This order is already "${o.status}" and can't move to "${body.status}". Refresh to see the latest status.`);
    o.status = body.status; o.tracking.push({ status: body.status, at: new Date().toISOString(), note: body.note });
    if (body.status === "accepted") makeInvoice(o);
    return o;
  }
  if (path === "/supplier/invoices" && method === "GET") return [...invoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  if (path === "/supplier/demand" && method === "GET") return demand;
  if (path === "/supplier/group-buys") {
    if (method === "GET") return groupBuys;
    if (method === "POST") {
      const input = body as GroupBuyInput; const p = products.find((x) => x.id === input.productId);
      if (!p) throw new DemoError(422, "Choose a product from your catalogue.");
      const g: GroupBuy = { id: `g${++seq}`, productId: p.id, productName: p.name, packSize: p.packSize, unit: p.unit, deadline: input.deadline, status: "open", tiers: input.tiers, committedPacks: 0, participantCount: 0 };
      groupBuys = [g, ...groupBuys]; return g;
    }
  }
  throw new DemoError(404, `Not available in demo: ${method} ${path}`);
}

export async function demoHandle<T>(method: string, path: string, body?: unknown): Promise<T> {
  await wait();
  const { ApiError } = await import("./client");
  try {
    return clone(await route(method, path, body)) as T;
  } catch (e) {
    if (e instanceof DemoError) {
      const kind = e.status === 409 ? "conflict" : e.status === 404 ? "not_found" : e.status === 401 || e.status === 410 ? "validation" : "validation";
      throw new ApiError(kind, e.message, e.status);
    }
    throw e;
  }
}
