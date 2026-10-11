// react-query wrappers around the API layer, so screens share one cache of the shop's data.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addShopProductsBulk,
  createBill,
  createShop,
  getMyShop,
  listBills,
  listOrders,
  listShopProducts,
  receiveOrder,
  recount,
  recountSuggestions,
  reorderSuggestions,
  type ShopProduct,
} from "@/api";

export const keys = {
  products: ["shop", "products"] as const,
  bills: ["shop", "bills"] as const,
  orders: ["shop", "orders"] as const,
  reorder: ["shop", "reorder"] as const,
  recountSuggestions: ["shop", "recount-suggestions"] as const,
};

export function useShopProducts() {
  return useQuery({
    queryKey: keys.products,
    queryFn: async () => (await listShopProducts()).items ?? ([] as ShopProduct[]),
  });
}

export function useBills() {
  return useQuery({ queryKey: keys.bills, queryFn: async () => (await listBills()).items ?? [] });
}

export function useOrders() {
  return useQuery({ queryKey: keys.orders, queryFn: async () => (await listOrders()).items ?? [] });
}

export function useReorderSuggestions() {
  return useQuery({
    queryKey: keys.reorder,
    queryFn: async () => (await reorderSuggestions()).items ?? [],
  });
}

export function useRecountSuggestions() {
  return useQuery({
    queryKey: keys.recountSuggestions,
    queryFn: async () => (await recountSuggestions()).items ?? [],
  });
}

/** After anything that changes stock, refresh everything derived from it. */
function useRefreshStock() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.products }),
      qc.invalidateQueries({ queryKey: keys.bills }),
      qc.invalidateQueries({ queryKey: keys.reorder }),
      qc.invalidateQueries({ queryKey: keys.recountSuggestions }),
    ]);
}

export function useCreateBill() {
  const refresh = useRefreshStock();
  return useMutation({ mutationFn: createBill, onSuccess: refresh });
}

export function useRecount() {
  const refresh = useRefreshStock();
  return useMutation({ mutationFn: recount, onSuccess: refresh });
}

export function useAddProductsBulk() {
  const refresh = useRefreshStock();
  return useMutation({ mutationFn: addShopProductsBulk, onSuccess: refresh });
}

export function useReceiveOrder() {
  const qc = useQueryClient();
  const refresh = useRefreshStock();
  return useMutation({
    mutationFn: receiveOrder,
    onSuccess: async () => {
      await refresh();
      await qc.invalidateQueries({ queryKey: keys.orders });
    },
  });
}

export function useCreateShop() {
  return useMutation({ mutationFn: createShop });
}

export { getMyShop };
