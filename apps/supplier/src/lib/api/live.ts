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
    return { sent: true as boolean };
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
