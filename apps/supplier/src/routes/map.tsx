import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/kn/AppShell";
import { SupplierMap } from "@/components/map/SupplierMap";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/map")({
  head: () => seo("Supplier Locations", "View our warehouse and distribution center locations."),
  component: () => (
    <AppShell title="Supplier Locations">
      <PageHeader eyebrow="Operations" title="Supplier Locations" />
      <div className="space-y-6">
        <SupplierMap />
      </div>
    </AppShell>
  ),
});