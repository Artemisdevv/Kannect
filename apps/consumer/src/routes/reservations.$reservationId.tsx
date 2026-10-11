import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ArrowLeft, Loader2, MapPin, Phone, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { qtyLabel } from '@/components/reserve-dialog';
import { STATUS_LABEL, statusMessage, tone } from '@/lib/reservation-text';
import { cancelReservation, endedWithoutPickup, fetchReservation, isOpen, noteClosed, savedReservation } from '@/lib/reservations';
import { rupees } from '@/lib/shopper';

export const Route = createFileRoute('/reservations/$reservationId')({
  head: () => ({ meta: [
    { title: 'Your pickup request — Kannect' },
    { name: 'description', content: 'See whether the shop has set your items aside.' },
  ] }),
  component: ReservationPage,
});

function ReservationPage() {
  const { reservationId } = Route.useParams();
  const saved = savedReservation(reservationId);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['reservation', reservationId],
    enabled: !!saved,
    retry: 1,
    queryFn: () => fetchReservation(reservationId, saved!.token),
    // keep checking while it is still open: the shop answers while the shopper waits
    refetchInterval: (q) => (isOpen(q.state.data?.status) ? 15_000 : false),
  });
  const cancel = useMutation({
    mutationFn: () => cancelReservation(reservationId, saved!.token),
    onSuccess: (r) => qc.setQueryData(['reservation', reservationId], r),
  });

  const status = query.data?.status;
  useEffect(() => { if (endedWithoutPickup(status)) noteClosed(reservationId); }, [status, reservationId]);

  const back = (
    <Button variant="ghost" asChild className="-ml-4">
      <Link to="/reservations"><ArrowLeft />My requests</Link>
    </Button>
  );

  if (!saved) {
    return <main className="app-main">{back}<div className="empty-state"><Store /><h1>Not found on this phone</h1><p>Requests are only listed on the phone that sent them.</p><Button asChild><Link to="/">Find shops</Link></Button></div></main>;
  }
  if (query.isLoading) {
    return <main className="app-main">{back}<div className="empty-state" role="status"><Loader2 className="animate-spin" /><h2>Checking with the shop…</h2></div></main>;
  }
  const r = query.data;
  if (query.isError || !r) {
    return <main className="app-main">{back}<div className="empty-state" role="alert"><Store /><h2>Couldn’t load this request</h2><p>{query.error instanceof Error ? query.error.message : 'Please try again.'}</p><Button onClick={() => void query.refetch()}>Try again</Button></div></main>;
  }

  return <main className="app-main">
    {back}
    <div className="detail-header"><div className="detail-symbol"><Store /></div><h1>{r.shop?.name}</h1><p>{r.shop?.address}</p></div>
    <div className="detail-product" style={{ display: 'block' }}>
      <span className={`availability ${tone(r.status)}`}>{STATUS_LABEL[r.status ?? ''] ?? r.status}</span>
      <p className="mt-3 text-sm" role="status">{statusMessage(r)}</p>
    </div>
    <div className="section-heading"><h2>Your items</h2></div>
    <div className="detail-product" style={{ display: 'block' }}>
      {(r.items ?? []).map((i) => (
        <div key={i.product_id} className="flex justify-between gap-3 text-sm py-1">
          <span>{i.name} × {qtyLabel(i.quantity ?? 0, i.unit === 'gram' ? 'gram' : 'piece')}</span>
          <strong>{rupees(i.line_total ?? 0)}</strong>
        </div>
      ))}
      <div className="flex justify-between border-t mt-2 pt-2 font-semibold"><span>Estimated total</span><span>{rupees(r.total ?? 0)}</span></div>
      <p className="text-xs text-muted-foreground mt-2">You pay at the shop. The final bill can differ if prices change.</p>
    </div>
    <div className="flex flex-wrap gap-2 mt-4">
      {r.shop?.phone && <Button variant="outline" asChild><a href={`tel:${r.shop.phone}`}><Phone />Call shop</a></Button>}
      {r.shop?.address && <Button variant="secondary" asChild><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.shop.name ?? ''} ${r.shop.address}`)}`} target="_blank" rel="noopener noreferrer"><MapPin />Directions</a></Button>}
      {isOpen(r.status) && <Button variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Cancelling…' : 'Cancel request'}</Button>}
    </div>
    {cancel.isError && <p className="mt-3 text-sm text-warning" role="alert">{cancel.error instanceof Error ? cancel.error.message : 'Could not cancel.'}</p>}
  </main>;
}
