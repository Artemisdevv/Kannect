import { queryOptions } from "@tanstack/react-query";
import { request } from "./client";
import { safeDemand } from "../rules";
import type {
  GroupBuy,
  GroupBuyInput,
  Invoice,
  Order,
  OrderStatus,
  Product,
  ProductInput,
  Session,
  Supplier,
  SupplierInput,
} from "./types";

export const api = {
  requestOtp: (phone: string) =>
    request<{ sent: boolean; resendAfterSeconds?: number }>("POST", "/auth/otp/request", { phone }),
  verifyOtp: (phone: string, otp: string) =>
    request<Session>("POST", "/auth/otp/verify", { phone, otp }),

  getSupplier: () => request<Supplier>("GET", "/supplier"),
  createSupplier: (b: SupplierInput) => request<Supplier>("POST", "/supplier", b),
  updateSupplier: (b: Partial<SupplierInput>) => request<Supplier>("PATCH", "/supplier", b),

  listProducts: () => request<Product[]>("GET", "/supplier/products"),
  createProduct: (b: ProductInput) => request<Product>("POST", "/supplier/products", b),
  updateProduct: (id: string, b: Partial<ProductInput>) =>
    request<Product>("PATCH", `/supplier/products/${id}`, b),

  listOrders: () => request<Order[]>("GET", "/supplier/orders"),
  setOrderStatus: (id: string, status: OrderStatus, note?: string) =>
    request<Order>("POST", `/supplier/orders/${id}/status`, { status, note }),

  // NOTE: invoice listing route is not named in the brief; confirm against the contract.
  listInvoices: () => request<Invoice[]>("GET", "/supplier/invoices"),

  listDemand: async () => safeDemand(await request<unknown[]>("GET", "/supplier/demand")),

  listGroupBuys: () => request<GroupBuy[]>("GET", "/supplier/group-buys"),
  createGroupBuy: (b: GroupBuyInput) => request<GroupBuy>("POST", "/supplier/group-buys", b),
};

export const q = {
  supplier: queryOptions({ queryKey: ["supplier"], queryFn: api.getSupplier, retry: false }),
  products: queryOptions({ queryKey: ["products"], queryFn: api.listProducts }),
  orders: queryOptions({ queryKey: ["orders"], queryFn: api.listOrders }),
  invoices: queryOptions({ queryKey: ["invoices"], queryFn: api.listInvoices }),
  demand: queryOptions({ queryKey: ["demand"], queryFn: api.listDemand }),
  groupBuys: queryOptions({ queryKey: ["group-buys"], queryFn: api.listGroupBuys }),
};
