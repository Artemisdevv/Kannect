import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/kn/AppShell";
import { ErrorState, ListSkeleton, errorText } from "@/components/kn/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, q } from "@/lib/api/service";
import { ApiError } from "@/lib/api/client";
import { seo } from "@/lib/seo";
import type { SupplierInput } from "@/lib/api/types";

export const Route = createFileRoute("/profile")({
  head: () => seo("Supplier profile", "View and edit your supplier business details."),
  component: () => (
    <AppShell title="Profile">
      <Profile />
    </AppShell>
  ),
});

const EMPTY: SupplierInput = { businessName: "", contactName: "", address: "", serviceArea: "", gstin: "" };
const FIELDS: { k: keyof SupplierInput; label: string; optional?: boolean }[] = [
  { k: "businessName", label: "Business name" },
  { k: "contactName", label: "Contact person" },
  { k: "address", label: "Address" },
  { k: "serviceArea", label: "Service area" },
  { k: "gstin", label: "GSTIN", optional: true },
];

function Profile() {
  const qc = useQueryClient();
  const sup = useQuery(q.supplier);
  const missing = sup.error instanceof ApiError && sup.error.kind === "not_found";
  const saved: SupplierInput = sup.data
    ? { businessName: sup.data.businessName, contactName: sup.data.contactName, address: sup.data.address, serviceArea: sup.data.serviceArea, gstin: sup.data.gstin ?? "" }
    : EMPTY;
  const [v, setV] = useState<SupplierInput>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (sup.data) setV(saved); }, [sup.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = FIELDS.filter((f) => (v[f.k] ?? "") !== (saved[f.k] ?? "")).map((f) => f.k);
  const dirty = changed.length > 0;

  const save = useMutation({
    mutationFn: () => {
      if (missing) return api.createSupplier(v);
      const patch = Object.fromEntries(changed.map((k) => [k, v[k]]));
      return api.updateSupplier(patch);
    },
    onSuccess: (s) => {
      qc.setQueryData(q.supplier.queryKey, s);
      toast.success("Profile saved");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fieldErrors) setErrors(e.fieldErrors);
      toast.error(errorText(e));
    },
  });

  if (sup.isLoading) return <ListSkeleton rows={3} />;
  if (sup.isError && !missing) return <ErrorState error={sup.error} onRetry={() => sup.refetch()} />;

  function submit() {
    const e: Record<string, string> = {};
    FIELDS.forEach((f) => { if (!f.optional && !String(v[f.k] ?? "").trim()) e[f.k] = `Enter ${f.label.toLowerCase()}.`; });
    if (v.gstin && !/^[0-9A-Z]{15}$/.test(v.gstin)) e["gstin"] = "GSTIN should be 15 letters/numbers.";
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  }

  return (
    <>
      <Button asChild variant="ghost" className="-ml-4 mb-2"><Link to="/more"><ArrowLeft /> More</Link></Button>
      <PageHeader eyebrow={sup.data?.phone ?? "New supplier"} title={missing ? "Set up your profile" : "Supplier profile"} />
      {dirty && !missing && (
        <p role="status" className="mb-4 rounded-[18px] bg-warning-surface px-4 py-2 text-sm text-warning">
          ● Unsaved changes to {changed.length} field{changed.length > 1 ? "s" : ""}
        </p>
      )}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {FIELDS.map((f) => (
          <div key={f.k} className="space-y-1.5">
            <Label htmlFor={`p-${f.k}`}>
              {f.label}{f.optional && <span className="text-muted-foreground"> (optional)</span>}
              {changed.includes(f.k) && !missing && <span className="ml-2 text-xs text-warning">edited</span>}
            </Label>
            <Input
              id={`p-${f.k}`}
              value={v[f.k] ?? ""}
              aria-invalid={!!errors[f.k]}
              onChange={(e) => setV({ ...v, [f.k]: f.k === "gstin" ? e.target.value.toUpperCase() : e.target.value })}
            />
            {errors[f.k] && <p className="text-xs font-medium text-destructive">{errors[f.k]}</p>}
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          {dirty && !missing && <Button type="button" variant="outline" className="flex-1" onClick={() => { setV(saved); setErrors({}); }}>Discard</Button>}
          <Button type="submit" className="flex-1" disabled={save.isPending || (!dirty && !missing)}>
            {save.isPending && <Loader2 className="animate-spin" />} {missing ? "Create profile" : "Save changes"}
          </Button>
        </div>
      </form>
    </>
  );
}
