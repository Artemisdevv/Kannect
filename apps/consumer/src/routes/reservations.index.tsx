import { useQueries } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, HandHelping } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { STATUS_LABEL, tone } from '@/lib/reservation-text';
import { endedWithoutPickup, fetchReservation, noteClosed, pruneClosed, savedReservations, visibleReservations } from '@/lib/reservations';
import { rupees } from '@/lib/shopper';

export const Route = createFileRoute('/reservations/')({
  head: () => ({ meta: [
    { title: 'My pickup requests — Kannect' },
    { name: 'description', content: 'Your reservations at local shops.' },
  ] }),
  component: ReservationsPage,
});

function ReservationsPage() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 10_000); return () => window.clearInterval(t); }, []);
  const saved = visibleReservations(savedReservations(), now);
  const results = useQueries({
    queries: saved.map((s) => ({
      queryKey: ['reservation', s.id],
      retry: 1,
      queryFn: () => fetchReservation(s.id, s.token),
      refetchInterval: 20_000, // the shop may have answered while this screen is open
    })),
  });

  // start the clock the first time a finished request is seen, and drop the ones whose time is up
  const closedIds = saved.filter((s, i) => endedWithoutPickup(results[i]?.data?.status)).map((s) => s.id).join(',');
  useEffect(() => { closedIds.split(',').filter(Boolean).forEach((id) => noteClosed(id)); pruneClosed(); }, [closedIds, now]);

  return <main className="app-main">
    <p className="eyebrow">Set aside for you</p>
    <h1 className="mt-2">My requests</h1>
    {saved.length === 0 ? (
      <div className="empty-state"><HandHelping /><h2>No requests yet</h2><p>Open a shop, tap Reserve on what you need, and the shop sets it aside. You pay when you collect.</p><Button asChild><Link to="/">Find shops</Link></Button></div>
    ) : (
      <div className="shop-list">
        {saved.map((s, i) => {
          const r = results[i]?.data;
          const count = (r?.items ?? []).length;
          return <article className="shop-card" key={s.id}>
            <div className="min-w-0">
              <h3>{r?.shop?.name ?? s.shopName}</h3>
              <p>{r ? `${count} item${count === 1 ? '' : 's'} · ${rupees(r.total ?? 0)}` : results[i]?.isError ? 'Couldn’t check just now' : 'Checking…'}</p>
              {r && <div className="shop-meta"><span className={`availability ${tone(r.status)}`}>{STATUS_LABEL[r.status ?? ''] ?? r.status}</span></div>}
            </div>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/reservations/$reservationId" params={{ reservationId: s.id }} aria-label="Open request"><ArrowUpRight /></Link>
            </Button>
          </article>;
        })}
      </div>
    )}
  </main>;
}
