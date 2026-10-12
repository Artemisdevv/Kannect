import type { Reservation } from '@/lib/reservations';
import type { Locale } from '@/lib/i18n';

export const STATUS_LABEL: Record<string, string> = {
  requested: 'Waiting for the shop',
  accepted: 'Confirmed, held for you',
  declined: 'Declined',
  cancelled: 'Cancelled',
  collected: 'Picked up',
  expired: 'Not answered in time',
};

export function statusMessage(r: Reservation, locale: Locale = 'en') {
  const shop = r.shop?.name ?? 'The shop';
  const until = r.hold_until
    ? new Date(r.hold_until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : '';
  if (locale === 'ml') {
    switch (r.status) {
      case 'requested': return `${shop}-ന് നിങ്ങളുടെ അഭ്യർത്ഥന ലഭിച്ചു. സാധനങ്ങൾ നിങ്ങൾക്കായി മാറ്റിവെച്ചിട്ടുണ്ട്. 10 മിനിറ്റിനുള്ളിൽ മറുപടി ലഭിച്ചില്ലെങ്കിൽ അഭ്യർത്ഥന സ്വയം അവസാനിക്കും.`;
      case 'accepted': return `${shop} സാധനങ്ങൾ നിങ്ങൾക്കായി മാറ്റിവെച്ചിട്ടുണ്ട്${until ? ` ${until} വരെ` : ''}. കടയിലെത്തി പണം നൽകുക.`;
      case 'declined': return r.decline_reason ? `${shop}-ന് ഇത്തവണ സാധനങ്ങൾ മാറ്റിവെക്കാനായില്ല: “${r.decline_reason}”.` : `${shop}-ന് ഇത്തവണ സാധനങ്ങൾ മാറ്റിവെക്കാനായില്ല.`;
      case 'cancelled': return 'നിങ്ങൾ ഈ അഭ്യർത്ഥന റദ്ദാക്കി.';
      case 'collected': return 'സാധനങ്ങൾ വാങ്ങി. സമീപത്തെ കടയിൽ നിന്ന് വാങ്ങിയതിന് നന്ദി.';
      case 'expired': return r.hold_until ? `${shop} ${until} വരെ സാധനങ്ങൾ മാറ്റിവെച്ചിരുന്നു. ഇപ്പോഴും വരുകയാണെങ്കിൽ കടയിൽ വിളിക്കുകയോ വീണ്ടും അഭ്യർത്ഥിക്കുകയോ ചെയ്യുക.` : `${shop} സമയത്ത് മറുപടി നൽകിയില്ല, അതിനാൽ സാധനങ്ങൾ വീണ്ടും ലഭ്യമാണ്. കടയിൽ വിളിക്കുകയോ മറ്റൊരു കടയിൽ അന്വേഷിക്കുകയോ ചെയ്യുക.`;
      default: return '';
    }
  }
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
