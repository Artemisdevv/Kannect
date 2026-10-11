// Shapes used by the supplier app. No OpenAPI contract was found in this repo,
// so these mirror the routes named in the product brief. Align them with the
// contract once it is available.

export type OrderStatus = "new" | "accepted" | "rejected" | "dispatched" | "delivered";

export interface Supplier {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  gstin?: string;
  address: string;
  serviceArea: string;
}

export type SupplierInput = Omit<Supplier, "id" | "phone">;

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  packSize: number;
  unit: string; // e.g. "kg", "L", "pcs"
  wholesalePrice: number; // ₹ per pack
  moq: number; // minimum order quantity in packs
  active: boolean;
}

export type ProductInput = Omit<Product, "id">;

export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  packSize: number;
  unit: string;
  quantity: number;
  unitPrice: number;
}

export interface TrackingEvent {
  status: OrderStatus;
  at: string;
  note?: string;
}

export interface Order {
  id: string;
  reference: string;
  retailer: { name: string; area: string };
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  tracking: TrackingEvent[];
  invoiceId?: string;
}

export interface Invoice {
  id: string;
  number: string;
  orderId: string;
  orderReference: string;
  issuedAt: string;
  supplier: { businessName: string; address: string; gstin?: string };
  retailer: { name: string; area: string };
  lines: OrderItem[];
  subtotal: number;
  gstRate: number; // illustrative flat rate
  gst: number;
  total: number;
  status?: "unpaid" | "paid";
}

export interface DemandSignal {
  productName: string;
  category: string;
  packSize: number;
  unit: string;
  shopCount: number;
  totalPacks: number;
  period: string;
}

export type GroupBuyStatus = "open" | "confirmed" | "failed" | "expired";

export interface PriceTier {
  minPacks: number;
  price: number;
}

export interface GroupBuy {
  id: string;
  productId: string;
  productName: string;
  packSize: number;
  unit: string;
  deadline: string;
  status: GroupBuyStatus;
  tiers: PriceTier[];
  committedPacks?: number;
  participantCount?: number;
}

export interface GroupBuyInput {
  productId: string;
  deadline: string;
  tiers: PriceTier[];
}

export interface Session {
  token: string;
  role: string;
  phone: string;
}
