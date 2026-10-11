import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ClipboardList, Package, TrendingUp, Users, Menu, WifiOff, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "@/lib/session";
import { IS_DEMO } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/catalogue", label: "Catalogue", icon: Package },
  { to: "/demand", label: "Demand", icon: TrendingUp },
  { to: "/group-buys", label: "Group buys", icon: Users },
  { to: "/more", label: "More", icon: Menu },
] as const;

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  return online;
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { ready, session } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const online = useOnline();

  useEffect(() => {
    if (ready && !session) navigate({ to: "/login", replace: true });
  }, [ready, session, navigate]);

  return (
    <div className="app-shell flex flex-col">
      <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur">
        <Link to="/" className="flex min-h-12 items-center gap-2 font-bold text-primary">
          <img src="/favicon.png" alt="" width={28} height={28} className="rounded-lg" />
          <span>KadaNet <span className="font-medium text-muted-foreground">Supplier</span></span>
        </Link>
        {IS_DEMO && (
          <span className="status-pill bg-warning-surface text-warning" title="Sample data, not live activity">
            Demo data
          </span>
        )}
      </header>
      {!online && (
        <div role="status" className="no-print flex items-center gap-2 bg-danger-surface px-6 py-2 text-sm text-destructive">
          <WifiOff className="h-4 w-4" /> You're offline. Changes can't be saved until you reconnect.
        </div>
      )}
      <main className="app-main flex-1" aria-label={title}>
        {!ready || !session ? (
          <div className="flex justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
          </div>
        ) : (
          children
        )}
      </main>
      <nav
        aria-label="Main"
        className="no-print fixed bottom-0 left-1/2 z-30 grid w-[min(100%,760px)] -translate-x-1/2 grid-cols-5 border-t border-border bg-elevated"
        style={{ padding: "6px 12px max(8px, env(safe-area-inset-bottom))" }}
      >
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/") ||
            (to === "/more" && ["/profile", "/invoices"].some((p) => pathname.startsWith(p)));
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[18px] text-[9.5px]",
                active ? "bg-secondary font-bold text-secondary-foreground" : "font-medium text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}
