import type { Reservation } from '@/lib/reservations';

export const STATUS_LABEL: Record<string, string> = {
  requested: 'Waiting for the shop',
  accepted: 'Confirmed, held for you',
  declined: 'Declined',
  cancelled: 'Cancelled',
  collected: 'Picked up',
  expired: 'Not answered in time',
};

export function statusMessage(r: Reservation) {
  const shop = r.shop?.name ?? 'The shop';
  const until = r.hold_until
    ? new Date(r.hold_until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : '';
  switch (r.status) {
    case 'requested':
      return `${shop} has your request and these are set aside for you. If they do not answer within 10 minutes it closes by itself.`;
    case 'accepted':
      return `${shop} is holding these for you${until ? ` until ${until}` : ''}. Come by and pay at the shop.`;
    case 'declined':
      return r.decline_reason
        ? `${shop} could not set these aside: “${r.decline_reason}”.`
        : `${shop} could not set these aside this time.`;
    case 'cancelled':
      return 'You cancelled this request.';
    case 'collected':
      return 'Picked up. Thank you for shopping local.';
    case 'expired':
      return r.hold_until
        ? `${shop} held these until ${until}. Call them if you are still coming, or reserve again.`
        : `${shop} did not answer in time, so the items were released. Call them or try another shop.`;
    default:
      return '';
  }
}

/** Reuses the in-stock / low / out colours for request states. */
export const tone = (status?: string) =>
  status === 'accepted' || status === 'collected' ? 'in' : status === 'requested' ? 'low' : 'out';
