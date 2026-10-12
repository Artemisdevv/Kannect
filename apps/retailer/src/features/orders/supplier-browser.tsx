import { ChevronLeft, ChevronRight, Store } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listSupplierProducts, listSuppliers } from "@/api";
import { useShop } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LocationCard } from "@/features/home/location-card";
import { rupees } from "@/lib/format";
import { t, tf, useLocale } from "@/lib/i18n";

type Supplier = NonNullable<Awaited<ReturnType<typeof listSuppliers>>["items"]>[number];
export type SupplierRow = NonNullable<Awaited<ReturnType<typeof listSupplierProducts>>["items"]>[number];

/**
 * Everything a nearby supplier sells, not only items this shop is already low on. This is how a
 * brand-new supplier listing (say, a new chips line) reaches a shop that has never stocked it.
 */
export function SupplierBrowser({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (row: SupplierRow) => void;
}) {
  const locale = useLocale();
  const shop = useShop();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [q, setQ] = useState("");

  const suppliers = useQuery({
    queryKey: ["suppliers", shop?.id, shop?.location?.lat, shop?.location?.lng],
    queryFn: async () => (await listSuppliers()).items ?? [],
    enabled: open,
  });
  const products = useQuery({
    queryKey: ["supplier-products", supplier?.id, q],
    queryFn: async () => (await listSupplierProducts(supplier!.id as string, q.trim() || undefined)).items ?? [],
    enabled: open && supplier !== null,
  });

  const close = (next: boolean) => {
    if (!next) {
      setSupplier(null);
      setQ("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="mobile-dialog">
        <DialogTitle>{supplier ? supplier.name : t("Suppliers near you", locale)}</DialogTitle>
        <DialogDescription>
          {supplier
            ? t("Everything this supplier sells. Pick an item to order.", locale)
            : t("Browse what nearby suppliers sell, even items you have never stocked.", locale)}
        </DialogDescription>

        {supplier ? (
          <>
            <Button variant="ghost" size="sm" className="self-start" onClick={() => { setSupplier(null); setQ(""); }}>
              <ChevronLeft /> {t("All suppliers", locale)}
            </Button>
            <input
              className="page-search"
              placeholder={t("Search this supplier's items…", locale)}
              aria-label={t("Search this supplier's items", locale)}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {products.isLoading && <p className="text-sm text-muted-foreground">{t("Loading…", locale)}</p>}
            {products.isError && <p className="text-sm text-warning">{t("Could not load this supplier's items.", locale)}</p>}
            {products.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("No items found.", locale)}</p>}
            {(products.data ?? []).map((row) => (
              <button key={row.product?.id} type="button" className="order-preview w-full text-left border-b" onClick={() => onPick(row)}>
                <div className="min-w-0">
                  <div className="product-name">{row.product?.name}</div>
                  <div className="product-sub">
                    {tf("Pack of {size} · min {min}", { size: row.pack_size ?? 1, min: row.min_order_packs ?? 1 }, locale)}
                  </div>
                </div>
                <strong>{rupees(row.price)}</strong>
              </button>
            ))}
          </>
        ) : (
          <>
            {!shop?.location && <LocationCard />}
            {suppliers.isLoading && <p className="text-sm text-muted-foreground">{t("Loading…", locale)}</p>}
            {suppliers.isError && <p className="text-sm text-warning">{t("Could not load suppliers.", locale)}</p>}
            {shop?.location && suppliers.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("No supplier delivers to your shop's location yet.", locale)}</p>
            )}
            {(suppliers.data ?? []).map((s) => (
              <button key={s.id} type="button" className="order-preview w-full text-left border-b" onClick={() => setSupplier(s)}>
                <Store className="text-primary" />
                <div className="min-w-0">
                  <div className="product-name">{s.name}</div>
                  {s.address && <div className="product-sub">{s.address}</div>}
                </div>
                <ChevronRight />
              </button>
            ))}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
