// react-query wrappers around the API layer, so screens share one cache of the shop's data.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  acceptReservation,
  addShopProductsBulk,
  collectReservation,
  createBill,
  createShop,
  declineReservation,
  getMyShop,
  joinGroupBuy,
  listBills,
  listOpenGroupBuys,
  listOrders,
  listReservations,
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
  pickups: ["shop", "pickups"] as const,
  groupBuys: ["group-buys", "open"] as const,
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

// ---------- group buys ----------

export function useOpenGroupBuys() {
  return useQuery({
    queryKey: keys.groupBuys,
    queryFn: async () => (await listOpenGroupBuys()).items ?? [],
  });
}

export function useJoinGroupBuy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupBuyId, packs }: { groupBuyId: string; packs: number }) =>
      joinGroupBuy(groupBuyId, packs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.groupBuys });
    },
  });
}

// ---------- pickup requests ----------

/** New requests arrive while the owner is busy, so look again every 30 seconds and when the app regains focus. */
export function usePickups() {
  return useQuery({
    queryKey: keys.pickups,
    queryFn: async () => (await listReservations()).items ?? [],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function usePickupActions() {
  const qc = useQueryClient();
  const refresh = useRefreshStock();
  const done = async () => {
    await qc.invalidateQueries({ queryKey: keys.pickups });
  };
  return {
    accept: useMutation({ mutationFn: (v: { id: string; holdMinutes?: number }) => acceptReservation(v.id, v.holdMinutes), onSuccess: done }),
    decline: useMutation({ mutationFn: (v: { id: string; reason?: string }) => declineReservation(v.id, v.reason), onSuccess: done }),
    collect: useMutation({
      mutationFn: (v: { id: string; paymentMode?: "cash" | "upi" | "card" | "other" }) => collectReservation(v.id, v.paymentMode),
      onSuccess: async () => {
        await done();
        await refresh(); // handing it over made a bill: stock and sales changed
      },
    }),
  };
}
