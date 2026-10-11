import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { OrderStatus, GroupBuyStatus } from "@/lib/api/types";

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="list-surface" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="product-row">
          <Skeleton className="h-10 w-10 rounded-[18px] bg-muted" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3 bg-muted" />
            <Skeleton className="h-2.5 w-1/3 bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="list-surface flex flex-col items-center px-6 py-10 text-center">
      <div className="product-art mb-3"><Inbox className="h-5 w-5" aria-hidden /></div>
      <h3 className="section-title">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function errorText(e: unknown) {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong. Please try again.";
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-[32px] border border-border bg-danger-surface px-6 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      <p className="mt-2 font-semibold text-destructive">Couldn't load this</p>
      <p className="mt-1 text-sm text-foreground">{errorText(error)}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

const ORDER_TONE: Record<OrderStatus, string> = {
  new: "bg-warning-surface text-warning",
  accepted: "bg-secondary text-secondary-foreground",
  dispatched: "bg-accent text-accent-foreground",
  delivered: "bg-accent text-accent-foreground",
  rejected: "bg-danger-surface text-destructive",
};
export const ORDER_LABEL: Record<OrderStatus, string> = {
  new: "New", accepted: "Accepted", rejected: "Rejected", dispatched: "Dispatched", delivered: "Delivered",
};
export function OrderPill({ status }: { status: OrderStatus }) {
  return <span className={cn("status-pill", ORDER_TONE[status])}>{status === "delivered" && "✓ "}{ORDER_LABEL[status]}</span>;
}

const GB_TONE: Record<GroupBuyStatus, string> = {
  open: "bg-warning-surface text-warning",
  confirmed: "bg-accent text-accent-foreground",
  failed: "bg-danger-surface text-destructive",
  expired: "bg-muted text-muted-foreground",
};
export function GroupBuyPill({ status }: { status: GroupBuyStatus }) {
  return <span className={cn("status-pill capitalize", GB_TONE[status])}>{status}</span>;
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "danger" | "neutral"; children: ReactNode }) {
  const t = { ok: "bg-accent text-accent-foreground", warn: "bg-warning-surface text-warning", danger: "bg-danger-surface text-destructive", neutral: "bg-secondary text-secondary-foreground" }[tone];
  return <span className={cn("status-pill", t)}>{children}</span>;
}
