import { Check, Clock, PackageCheck, Phone, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, type Reservation } from "@/api";
import { Heading, Shell } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePickupActions, usePickups } from "@/features/queries";
import { formatQty, rupees } from "@/lib/format";
import { t, tf, useLocale, type Locale } from "@/lib/i18n";

const HOLD_CHOICES = [
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "4 hours" },
  { minutes: 480, label: "Today (8 h)" },
]; // i18n-ignore: translated where they are shown

const STATUS_TEXT: Record<string, string> = {
  requested: "New request",
  accepted: "Held for pickup",
  declined: "Declined",
  cancelled: "Cancelled by shopper",
  collected: "Picked up",
  expired: "Hold ran out",
};

function when(iso: string | null | undefined, locale: Locale) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(locale === "ml" ? "ml-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

type Action = { kind: "accept" | "decline" | "collect"; reservation: Reservation };

export function PickupsPage() {
  const locale = useLocale();
  const pickups = usePickups();
  const actions = usePickupActions();
  const [action, setAction] = useState<Action | null>(null);
  const [hold, setHold] = useState(120);
  const [reason, setReason] = useState("");
  const [payment, setPayment] = useState<"cash" | "upi" | "card" | "other">("cash");

  const all = pickups.data ?? [];
  const waiting = all.filter((r) => r.status === "requested");
  const held = all.filter((r) => r.status === "accepted");
  const past = all.filter((r) => !["requested", "accepted"].includes(r.status ?? "")).slice(0, 20);

  const open = (kind: Action["kind"], reservation: Reservation) => {
    setAction({ kind, reservation });
    setReason("");
    setHold(120);
    setPayment("cash");
  };

  const run = async () => {
    if (!action?.reservation.id) return;
    const id = action.reservation.id;
    try {
      if (action.kind === "accept") {
        await actions.accept.mutateAsync({ id, holdMinutes: hold });
        toast.success(t("Accepted. The shopper can see it is held for them.", locale));
      } else if (action.kind === "decline") {
        await actions.decline.mutateAsync({ id, ...(reason.trim() ? { reason: reason.trim() } : {}) });
        toast.success(t("Declined", locale));
      } else {
        await actions.collect.mutateAsync({ id, paymentMode: payment });
        toast.success(t("Handed over and billed", locale));
      }
      setAction(null);
    } catch (e) {
      toast.error(message(e, t("Could not update this request.", locale)));
    }
  };

  const busy = actions.accept.isPending || actions.decline.isPending || actions.collect.isPending;

  const card = (r: Reservation) => (
    <div key={r.id} className="p-4 border-b last:border-0 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="product-name">{r.customer_name}</div>
          <div className="product-sub">
            {tf("{status} · asked {time}", { status: STATUS_TEXT[r.status ?? ""] ? t(STATUS_TEXT[r.status ?? ""]!, locale) : (r.status ?? ""), time: when(r.created_at, locale) }, locale)}
            {r.status === "accepted" && r.hold_until ? tf(" · held until {time}", { time: when(r.hold_until, locale) }, locale) : ""}
          </div>
        </div>
        <strong>{rupees(r.total)}</strong>
      </div>
      <ul className="text-sm space-y-0.5">
        {(r.items ?? []).map((i) => (
          <li key={i.product_id}>
            {i.name} × {formatQty(i.quantity, i.unit, locale)}
          </li>
        ))}
      </ul>
      {r.note && <p className="text-xs rounded-xl bg-secondary p-2">“{r.note}”</p>}
      {r.decline_reason && <p className="text-xs text-muted-foreground">{tf("Reason given: {reason}", { reason: r.decline_reason }, locale)}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" asChild>
          <a href={`tel:${r.customer_phone}`}>
            <Phone /> {t("Call", locale)}
          </a>
        </Button>
        {r.status === "requested" && (
          <>
            <Button size="sm" onClick={() => open("accept", r)}>
              <Check /> {t("Accept", locale)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => open("decline", r)}>
              <X /> {t("Decline", locale)}
            </Button>
          </>
        )}
        {r.status === "accepted" && (
          <>
            <Button size="sm" onClick={() => open("collect", r)}>
              <PackageCheck /> {t("Handed over", locale)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => open("decline", r)}>
              <X /> {t("Release", locale)}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <Shell active="Orders">
      <p className="eyebrow">{t("Shoppers asking you to set items aside", locale)}</p>
      <h1>{t("Pickup requests", locale)}</h1>

      {pickups.isLoading && <p className="text-sm text-muted-foreground mt-3">{t("Loading…", locale)}</p>}
      {pickups.isError && <p className="text-sm text-destructive mt-3">{t("Could not load requests. Pull down to retry.", locale)}</p>}
      {pickups.data && all.length === 0 && (
        <div className="list-surface p-5 mt-4 space-y-1">
          <p className="text-sm">{t("No pickup requests yet.", locale)}</p>
          <p className="text-xs text-muted-foreground">{t("When a shopper reserves something from your shop in the Kannect app, it shows up here.", locale)}</p>
        </div>
      )}

      {waiting.length > 0 && (
        <>
          <Heading title={tf("New ({n})", { n: waiting.length }, locale)} />
          <div className="list-surface">{waiting.map(card)}</div>
        </>
      )}
      {held.length > 0 && (
        <>
          <Heading title={tf("Held for pickup ({n})", { n: held.length }, locale)} />
          <div className="list-surface">{held.map(card)}</div>
        </>
      )}
      {past.length > 0 && (
        <>
          <Heading title={t("Earlier", locale)} />
          <div className="list-surface">{past.map(card)}</div>
        </>
      )}

      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="mobile-dialog">
          <DialogTitle>
            {action?.kind === "accept" && t("Accept this request?", locale)}
            {action?.kind === "decline" && t(action.reservation.status === "accepted" ? "Release the hold?" : "Decline this request?", locale)}
            {action?.kind === "collect" && t("Handed over to the shopper?", locale)}
          </DialogTitle>
          <DialogDescription>
            {action?.reservation.customer_name} · {rupees(action?.reservation.total)}
          </DialogDescription>

          {action?.kind === "accept" && (
            <>
              <p className="text-sm">
                {t("The items are held for this shopper and nobody else can be promised them. Stock only drops when you hand them over.", locale)}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock size={14} /> {t("Hold for", locale)}
              </p>
              <div className="flex flex-wrap gap-2">
                {HOLD_CHOICES.map((c) => (
                  <Button key={c.minutes} size="sm" variant={hold === c.minutes ? "secondary" : "outline"} onClick={() => setHold(c.minutes)}>
                    {t(c.label, locale)}
                  </Button>
                ))}
              </div>
            </>
          )}

          {action?.kind === "decline" && (
            <input
              className="page-search"
              aria-label={t("Reason (optional)", locale)}
              placeholder={t("Reason the shopper will see (optional)", locale)}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}

          {action?.kind === "collect" && (
            <>
              <p className="text-sm">{tf("This makes a bill for {amount} and takes the items off your stock.", { amount: rupees(action.reservation.total) }, locale)}</p>
              <select className="page-search kn-select" aria-label={t("Payment", locale)} value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)}>
                <option value="cash">{t("Cash", locale)}</option>
                <option value="upi">{t("UPI", locale)}</option>
                <option value="card">{t("Card", locale)}</option>
                <option value="other">{t("Other", locale)}</option>
              </select>
            </>
          )}

          <Button disabled={busy} onClick={() => void run()}>
            {busy ? t("Saving…", locale) : t(action?.kind === "accept" ? "Accept and hold" : action?.kind === "decline" ? "Confirm" : "Bill it", locale)}
          </Button>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
