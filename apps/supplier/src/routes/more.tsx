import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileText, LogOut, Store } from "lucide-react";
import { AppShell, PageHeader } from "@/components/kn/AppShell";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { IS_DEMO } from "@/lib/api/client";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/more")({
  head: () => seo("More", "Supplier profile, invoices and account settings."),
  component: () => (
    <AppShell title="More">
      <More />
    </AppShell>
  ),
});

function More() {
  const { session, signOut } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function out() {
    await qc.cancelQueries();
    qc.clear();
    signOut();
    navigate({ to: "/login", replace: true });
  }
  return (
    <>
      <PageHeader eyebrow={session?.phone ?? ""} title="More" />
      <div className="list-surface">
        {[
          { to: "/profile", icon: Store, t: "Supplier profile", s: "Business name, address, service area" },
          { to: "/invoices", icon: FileText, t: "Invoices", s: "Demo invoices for accepted orders" },
        ].map(({ to, icon: I, t, s }) => (
          <Link key={to} to={to} className="product-row">
            <div className="product-art"><I className="h-[21px] w-[21px]" aria-hidden /></div>
            <div className="min-w-0 flex-1">
              <div className="product-name">{t}</div>
              <div className="product-sub">{s}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
      <h2 className="section-title mb-3 mt-7">Settings</h2>
      <div className="summary text-sm">
        <p><b>Connection:</b> {IS_DEMO ? "Demo mode — sample data, nothing is sent to a server." : "Connected to KadaNet server."}</p>
        <p className="mt-2 text-muted-foreground">Install: use your browser menu → “Add to Home screen”.</p>
      </div>
      <Button variant="outline" size="lg" className="mt-6 w-full" onClick={out}><LogOut /> Sign out</Button>
    </>
  );
}
