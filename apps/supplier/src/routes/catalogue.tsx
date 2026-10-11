import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Package, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/kn/AppShell";
import { EmptyState, ErrorState, ListSkeleton, Pill, errorText } from "@/components/kn/states";
import { ConfirmDialog } from "@/components/kn/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, q } from "@/lib/api/service";
import { ApiError } from "@/lib/api/client";
import { inr, pack } from "@/lib/format";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Product, ProductInput } from "@/lib/api/types";

export const Route = createFileRoute("/catalogue")({
  head: () => seo("Catalogue", "Manage your wholesale products, pack sizes and prices."),
  component: () => (
    <AppShell title="Catalogue">
      <Catalogue />
    </AppShell>
  ),
});

type Filter = "all" | "active" | "inactive";

function Catalogue() {
  const products = useQuery(q.products);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) =>
        (filter === "all" || (filter === "active") === p.active) &&
        (!s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)),
    );
  }, [products.data, search, filter]);

  return (
    <>
      <PageHeader
        eyebrow="Wholesale"
        title="Catalogue"
        action={<Button onClick={() => setEditing("new")}><Plus /> Add</Button>}
      />
      <label className="mb-3 flex min-h-12 items-center gap-2 rounded-full bg-card px-[18px]">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Search products</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, SKU or category"
          className="min-h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button aria-label="Clear search" className="grid h-12 w-12 place-items-center" onClick={() => setSearch("")}><X className="h-4 w-4" /></button>
        )}
      </label>
      <div className="mb-4 flex gap-2">
        {(["all", "active", "inactive"] as Filter[]).map((f) => (
          <button
            key={f}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn("min-h-12 rounded-full border px-4 text-sm capitalize", filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
          >
            {f}
          </button>
        ))}
      </div>

      {products.isLoading ? (
        <ListSkeleton />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          title={products.data?.length ? "No matching products" : "Your catalogue is empty"}
          body={products.data?.length ? "Try a different search or filter." : "Add your first wholesale product so retailers can order from you."}
          action={!products.data?.length && <Button onClick={() => setEditing("new")}><Plus /> Add product</Button>}
        />
      ) : (
        <div className="list-surface">
          {list.map((p) => (
            <button key={p.id} onClick={() => setEditing(p)} className="product-row w-full text-left hover:bg-secondary/50">
              <div className="product-art"><Package className="h-[21px] w-[21px]" aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <div className="product-name truncate">{p.name}</div>
                <div className="product-sub">
                  <span className="rounded bg-muted px-1">{p.sku}</span> · {inr(p.wholesalePrice)} / {pack(p.packSize, p.unit)} · MOQ {p.moq}
                </div>
              </div>
              {p.active ? <Pill tone="ok">Active</Pill> : <Pill tone="danger">Inactive</Pill>}
            </button>
          ))}
        </div>
      )}

      {editing && <ProductDialog product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const EMPTY: ProductInput = { sku: "", name: "", category: "", packSize: 1, unit: "kg", wholesalePrice: 0, moq: 1, active: true };

function validate(v: ProductInput) {
  const e: Record<string, string> = {};
  if (!v.name.trim()) e["name"] = "Enter a product name.";
  if (!v.sku.trim()) e["sku"] = "Enter a SKU code.";
  if (!(v.packSize > 0)) e["packSize"] = "Pack size must be more than 0.";
  if (!v.unit.trim()) e["unit"] = "Enter a unit, e.g. kg, L or pcs.";
  if (!(v.wholesalePrice > 0)) e["wholesalePrice"] = "Price must be more than ₹0.";
  if (!Number.isInteger(v.moq) || v.moq < 1) e["moq"] = "Minimum order must be a whole number, 1 or more.";
  return e;
}

function ProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const qc = useQueryClient();
  const initial: ProductInput = product ? { ...product } : EMPTY;
  const [v, setV] = useState<ProductInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOff, setConfirmOff] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: (body: ProductInput) => (product ? api.updateProduct(product.id, body) : api.createProduct(body)),
    onSuccess: (p) => {
      toast.success(product ? `Saved ${p.name}` : `Added ${p.name}`);
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fieldErrors) setErrors(e.fieldErrors);
      toast.error(errorText(e));
    },
  });

  const set = <K extends keyof ProductInput>(k: K, val: ProductInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const submit = () => {
    const e = validate(v);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (product && product.active && !v.active) return setConfirmOff(true);
    save.mutate(v);
  };

  const field = (k: keyof ProductInput, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`f-${k}`}>{label}</Label>
      <Input
        id={`f-${k}`}
        value={String(v[k])}
        aria-invalid={!!errors[k]}
        aria-describedby={errors[k] ? `e-${k}` : undefined}
        onChange={(e) => set(k, (props.type === "number" ? Number(e.target.value) : e.target.value) as never)}
        {...props}
      />
      {errors[k] && <p id={`e-${k}`} className="text-xs font-medium text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-28px)] overflow-y-auto rounded-[32px] bg-elevated">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>
            {dirty ? <span className="font-medium text-warning">● Unsaved changes</span> : product ? "Saved values shown." : "Price is per pack. Retailers order in packs."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {field("name", "Product name")}
          <div className="grid grid-cols-2 gap-3">
            {field("sku", "SKU code")}
            {field("category", "Category")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("packSize", "Pack size", { type: "number", inputMode: "decimal", min: 0, step: "any" })}
            {field("unit", "Unit (kg, L, pcs)")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("wholesalePrice", "Price per pack (₹)", { type: "number", inputMode: "decimal", min: 0, step: "0.01" })}
            {field("moq", "Min. order (packs)", { type: "number", inputMode: "numeric", min: 1, step: 1 })}
          </div>
          <p className="rounded-[18px] bg-card px-4 py-2 text-sm">
            Retailers see: <b>{v.wholesalePrice > 0 ? inr(v.wholesalePrice) : "₹—"}</b> per {v.packSize || "—"} {v.unit} pack
          </p>
          <label className="flex min-h-12 items-center justify-between gap-3">
            <span className="text-sm font-medium">Available to order</span>
            <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} />
          </label>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={save.isPending || (!!product && !dirty)}>
              {save.isPending && <Loader2 className="animate-spin" />} {product ? "Save changes" : "Add product"}
            </Button>
          </div>
        </form>
        <ConfirmDialog
          open={confirmOff}
          onOpenChange={setConfirmOff}
          title="Deactivate this product?"
          body="Retailers won't be able to order it until you turn it back on."
          confirmLabel="Deactivate"
          destructive
          pending={save.isPending}
          onConfirm={() => { setConfirmOff(false); save.mutate(v); }}
        />
      </DialogContent>
    </Dialog>
  );
}
