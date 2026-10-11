import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { AppShell } from "@/components/kn/AppShell";
import { ErrorState, ListSkeleton, Pill } from "@/components/kn/states";
import { Button } from "@/components/ui/button";
import { q } from "@/lib/api/service";
import { ApiError } from "@/lib/api/client";
import { dateOnly, inr, pack } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/invoices/$id")({
  head: () => seo("Invoice", "Demo invoice for a retailer order."),
  component: () => (
    <AppShell title="Invoice">
      <InvoiceDetail />
    </AppShell>
  ),
});

function InvoiceDetail() {
  const { id } = Route.useParams();
  const inv = useQuery(q.invoices);
  if (inv.isLoading) return <ListSkeleton />;
  if (inv.isError) return <ErrorState error={inv.error} onRetry={() => inv.refetch()} />;
  const i = inv.data?.find((x) => x.id === id);
  if (!i) return <ErrorState error={new ApiError("not_found", "Invoice not found.")} />;

  return (
    <>
      <div className="no-print mb-2 flex justify-between">
        <Button asChild variant="ghost" className="-ml-4"><Link to="/invoices"><ArrowLeft /> Invoices</Link></Button>
        <Button variant="outline" onClick={() => window.print()}><Printer /> Print</Button>
      </div>

      <div className="mb-4 rounded-[18px] bg-warning-surface px-4 py-3 text-sm text-warning">
        <b>Demo document.</b> This is not a GST-compliant tax invoice and is not tax advice. GST is shown at an illustrative flat rate. No payment is processed in this app.
      </div>

      <div className="summary space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Invoice</p>
            <h1 className="text-xl">{i.number}</h1>
            <p className="text-sm text-muted-foreground">{dateOnly(i.issuedAt)} · Order {i.orderReference}</p>
          </div>
          {i.status && <Pill tone={i.status === "paid" ? "ok" : "warn"}>{i.status === "paid" ? "Marked paid" : "Unpaid"}</Pill>}
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="eyebrow">From</p>
            <p className="font-semibold">{i.supplier.businessName}</p>
            <p className="text-muted-foreground">{i.supplier.address}</p>
            {i.supplier.gstin && <p className="text-muted-foreground">GSTIN {i.supplier.gstin}</p>}
          </div>
          <div>
            <p className="eyebrow">To</p>
            <p className="font-semibold">{i.retailer.name}</p>
            <p className="text-muted-foreground">{i.retailer.area}</p>
          </div>
        </div>
        <div className="divide-y divide-border text-sm">
          {i.lines.map((l) => (
            <div key={l.productId} className="flex justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">{l.name}</p>
                <p className="text-xs text-muted-foreground">{l.quantity} × {inr(l.unitPrice)} per {pack(l.packSize, l.unit)} pack</p>
              </div>
              <p className="tabular font-medium">{inr(l.quantity * l.unitPrice)}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular">{inr(i.subtotal)}</span></div>
          <div className="flex justify-between text-muted-foreground">
            <span>GST (illustrative flat {Math.round(i.gstRate * 100)}%)</span><span className="tabular">{inr(i.gst)}</span>
          </div>
          <div className="flex justify-between pt-1 text-base font-bold"><span>Total</span><span className="tabular">{inr(i.total)}</span></div>
        </div>
      </div>
      <Button asChild variant="secondary" className="no-print mt-4 w-full">
        <Link to="/orders/$id" params={{ id: i.orderId }}>View order</Link>
      </Button>
    </>
  );
}
