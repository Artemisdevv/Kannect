// Supplier-facing UI models. The API service maps OpenAPI response shapes
// into these view models.

export type OrderStatus = "new" | "accepted" | "rejected" | "dispatched" | "delivered" | "cancelled";

export interface Supplier {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  gstin?: string;
  address: string;
  serviceArea: string;
  location?: { lat: number; lng: number } | null;
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

export type ProductInput = Omit<Product, "id"> & { catalogueId?: string };

/** A product from the shared catalogue that a supplier can list for wholesale. */
export interface CatalogueChoice {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
}

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
  eta?: string | null;
}

export interface Order {
  id: string;
  reference: string;
  supplier?: { name: string; location?: { lat: number; lng: number } | null };
  retailer: { name: string; area: string; location?: { lat: number; lng: number } | null };
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
  /** Set by the live API: GST is not calculated, show this note instead. */
  taxNote?: string;
}

export interface DemandSignal {
  productName: string;
  category: string;
  packSize: number;
  unit: string;
  shopCount: number;
  totalPacks: number;
  period: string;
  /** Live API only: how many nearby shops were counted. */
  shopsTotal?: number;
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
  /** Live API only: false when this number has no supplier profile yet. */
  hasProfile?: boolean;
  token: string;
  role: string;
  phone: string;
}
