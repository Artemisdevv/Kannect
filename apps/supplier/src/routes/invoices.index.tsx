import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { AppShell, PageHeader } from "@/components/kn/AppShell";
import { EmptyState, ErrorState, ListSkeleton, Pill } from "@/components/kn/states";
import { Button } from "@/components/ui/button";
import { q } from "@/lib/api/service";
import { dateOnly, inr } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/invoices/")({
  head: () => seo("Invoices", "Demo invoices for your accepted retailer orders."),
  component: () => (
    <AppShell title="Invoices">
      <Invoices />
    </AppShell>
  ),
});

function Invoices() {
  const inv = useQuery(q.invoices);
  return (
    <>
      <Button asChild variant="ghost" className="-ml-4 mb-2"><Link to="/more"><ArrowLeft /> More</Link></Button>
      <PageHeader eyebrow="Demo documents" title="Invoices" />
      {inv.isLoading ? (
        <ListSkeleton />
      ) : inv.isError ? (
        <ErrorState error={inv.error} onRetry={() => inv.refetch()} />
      ) : !inv.data?.length ? (
        <EmptyState title="No invoices yet" body="An invoice appears once you accept an order." />
      ) : (
        <div className="list-surface">
          {inv.data.map((i) => (
            <Link key={i.id} to="/invoices/$id" params={{ id: i.id }} className="product-row">
              <div className="min-w-0 flex-1">
                <div className="product-name">{i.number}</div>
                <div className="product-sub">{i.orderReference} · {i.retailer.name} · {dateOnly(i.issuedAt)}</div>
              </div>
              <div className="text-right">
                <div className="product-name tabular">{inr(i.total)}</div>
                {i.status && <Pill tone={i.status === "paid" ? "ok" : "warn"}>{i.status === "paid" ? "Marked paid" : "Unpaid"}</Pill>}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
