import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/kn/AppShell";
import { EmptyState, ErrorState, ListSkeleton, errorText } from "@/components/kn/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, q } from "@/lib/api/service";
import { dateTime, inr, pack } from "@/lib/format";
import { seo } from "@/lib/seo";
import type { PriceTier } from "@/lib/api/types";

export const Route = createFileRoute("/group-buys/new")({
  head: () => seo("New group buy", "Set up a group buy with tiered prices and a deadline."),
  component: () => (
    <AppShell title="New group buy">
      <NewGroupBuy />
    </AppShell>
  ),
});

function NewGroupBuy() {
  const products = useQuery(q.products);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [productId, setProductId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [tiers, setTiers] = useState<PriceTier[]>([{ minPacks: 10, price: 0 }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);

  const create = useMutation({
    mutationFn: () => api.createGroupBuy({ productId, deadline: new Date(deadline).toISOString(), tiers }),
    onSuccess: (g) => {
      toast.success("Group buy published");
      qc.invalidateQueries({ queryKey: ["group-buys"] });
      navigate({ to: "/group-buys/$id", params: { id: g.id } });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  if (products.isLoading) return <ListSkeleton />;
  if (products.isError) return <ErrorState error={products.error} onRetry={() => products.refetch()} />;
  const active = products.data?.filter((p) => p.active) ?? [];
  if (!active.length)
    return (
      <EmptyState title="No active products" body="Add or activate a catalogue product before creating a group buy."
        action={<Button asChild><Link to="/catalogue">Go to catalogue</Link></Button>} />
    );
  const product = active.find((p) => p.id === productId);

  function validate() {
    const e: Record<string, string> = {};
    if (!product) e["product"] = "Choose a product.";
    if (!deadline) e["deadline"] = "Choose a deadline.";
    else if (new Date(deadline) <= new Date()) e["deadline"] = "Deadline must be in the future.";
    tiers.forEach((t, i) => {
      if (!Number.isInteger(t.minPacks) || t.minPacks < 1) e[`t${i}`] = "Minimum packs must be a whole number of 1 or more.";
      else if (!(t.price > 0)) e[`t${i}`] = "Price must be more than ₹0.";
      else if (product && t.price >= product.wholesalePrice) e[`t${i}`] = `Should be below your usual price of ${inr(product.wholesalePrice)}.`;
      else if (i > 0 && (t.minPacks <= tiers[i - 1]!.minPacks || t.price >= tiers[i - 1]!.price))
        e[`t${i}`] = "Each tier needs more packs and a lower price than the one before.";
    });
    setErrors(e);
    return !Object.keys(e).length;
  }

  const setTier = (i: number, k: keyof PriceTier, v: number) =>
    setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t)));

  return (
    <>
      <Button asChild variant="ghost" className="-ml-4 mb-2">
        <Link to="/group-buys"><ArrowLeft /> Group buys</Link>
      </Button>
      <PageHeader eyebrow={preview ? "Step 2 of 2 · Preview" : "Step 1 of 2"} title="New group buy" />

      {!preview ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (validate()) setPreview(true); }}>
          <div className="space-y-1.5">
            <Label htmlFor="gb-product">Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="gb-product" className="min-h-12 rounded-[18px] bg-elevated" aria-invalid={!!errors["product"]}>
                <SelectValue placeholder="Choose from your catalogue" />
              </SelectTrigger>
              <SelectContent>
                {active.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="min-h-12">
                    {p.name} · {pack(p.packSize, p.unit)} · {inr(p.wholesalePrice)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors["product"] && <p className="text-xs font-medium text-destructive">{errors["product"]}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gb-deadline">Deadline</Label>
            <Input id="gb-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-invalid={!!errors["deadline"]} />
            {errors["deadline"] && <p className="text-xs font-medium text-destructive">{errors["deadline"]}</p>}
          </div>
          <div>
            <p className="section-title mb-2">Price tiers {product && <span className="text-sm font-normal text-muted-foreground">(per {pack(product.packSize, product.unit)} pack)</span>}</p>
            <div className="space-y-3">
              {tiers.map((t, i) => (
                <div key={i} className="rounded-[18px] bg-card p-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`t-min-${i}`} className="text-xs">Min. packs</Label>
                      <Input id={`t-min-${i}`} type="number" inputMode="numeric" value={t.minPacks} onChange={(e) => setTier(i, "minPacks", Number(e.target.value))} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`t-price-${i}`} className="text-xs">Price (₹)</Label>
                      <Input id={`t-price-${i}`} type="number" inputMode="decimal" step="0.01" value={t.price || ""} onChange={(e) => setTier(i, "price", Number(e.target.value))} />
                    </div>
                    {tiers.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove tier ${i + 1}`} onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  {errors[`t${i}`] && <p className="mt-1 text-xs font-medium text-destructive">{errors[`t${i}`]}</p>}
                </div>
              ))}
            </div>
            {tiers.length < 3 && (
              <Button type="button" variant="secondary" className="mt-3" onClick={() => setTiers([...tiers, { minPacks: (tiers.at(-1)?.minPacks ?? 0) + 10, price: 0 }])}>
                <Plus /> Add tier
              </Button>
            )}
          </div>
          <Button type="submit" size="lg" className="w-full">Preview</Button>
        </form>
      ) : (
        product && (
          <>
            <div className="summary space-y-2">
              <p className="product-name text-base">{product.name} · {pack(product.packSize, product.unit)}</p>
              <p className="text-sm text-muted-foreground">Usual price {inr(product.wholesalePrice)} per pack</p>
              <p className="text-sm">Ends {dateTime(new Date(deadline).toISOString())}</p>
              <ul className="space-y-1 pt-2">
                {tiers.map((t) => (
                  <li key={t.minPacks} className="flex justify-between text-sm"><span>{t.minPacks}+ packs</span><b className="tabular">{inr(t.price)}</b></li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Retailers will see this offer. The lower price applies only if total pledges reach a tier before the deadline.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPreview(false)} disabled={create.isPending}>Edit</Button>
              <Button className="flex-1" onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" />} Publish
              </Button>
            </div>
          </>
        )
      )}
    </>
  );
}
