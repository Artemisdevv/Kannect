import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { parsePhone, tidy } from '@/lib/phone';
import { createReservation, saveContact, saveReservation, savedContact } from '@/lib/reservations';
import { rupees } from '@/lib/shopper';

export type ReserveLine = { productId: string; name: string; unit: 'piece' | 'gram'; price: number; quantity: number };

export const lineTotal = (l: ReserveLine) => Math.round((l.unit === 'gram' ? (l.price * l.quantity) / 1000 : l.price * l.quantity) * 100) / 100;
export const qtyLabel = (quantity: number, unit: 'piece' | 'gram') => (unit === 'gram' ? (quantity >= 1000 ? `${+(quantity / 1000).toFixed(2)} kg` : `${quantity} g`) : `${quantity}`);

export function ReserveDialog({ open, onOpenChange, shop, lines, onDone }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  shop: { id: string; name: string }; lines: ReserveLine[]; onDone: () => void;
}) {
  const navigate = useNavigate();
  const saved = savedContact();
  const [name, setName] = useState(saved.name);
  const [phone, setPhone] = useState(saved.phone);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One id per attempt: if the connection drops after the shop got it, retrying cannot make two requests.
  const clientId = useRef(crypto.randomUUID());

  const parsed = parsePhone(phone);
  const cleanName = tidy(name);
  const nameError = cleanName.length < 2 ? 'Enter your name so the shop knows who is coming.' : '';
  const total = lines.reduce((sum, l) => sum + lineTotal(l), 0);

  async function submit() {
    setTouched(true); setError('');
    if (nameError || parsed.error !== undefined || lines.length === 0) return;
    setBusy(true);
    try {
      const res = await createReservation({
        clientId: clientId.current, shopId: shop.id, name: cleanName, phone: parsed.phone,
        ...(tidy(note) ? { note: tidy(note) } : {}),
        items: lines.map(l => ({ productId: l.productId, quantity: l.quantity })),
      });
      if (!res.id || !res.access_token) throw new Error('The shop did not confirm your request. Please try again.');
      saveContact({ name: cleanName, phone });
      saveReservation({ id: res.id, token: res.access_token, shopName: shop.name, at: Date.now() });
      clientId.current = crypto.randomUUID();
      onDone();
      onOpenChange(false);
      await navigate({ to: '/reservations/$reservationId', params: { reservationId: res.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request. Please try again.');
    } finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>Reserve at {shop.name}</DialogTitle>
      <DialogDescription>The shop sets these aside if they can. You pay at the shop when you collect. No payment now.</DialogDescription></DialogHeader>
    <div className="rounded-2xl bg-secondary p-3 text-sm space-y-1">
      {lines.map(l => <div key={l.productId} className="flex justify-between gap-3"><span>{l.name} × {qtyLabel(l.quantity, l.unit)}</span><strong>{rupees(lineTotal(l))}</strong></div>)}
      <div className="flex justify-between border-t pt-1 font-semibold"><span>Estimated total</span><span>{rupees(total)}</span></div>
    </div>
    <form className="grid gap-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div><Input aria-label="Your name" placeholder="Your name" maxLength={80} autoComplete="name" value={name} aria-invalid={touched && !!nameError} onChange={e => setName(e.target.value)} />
        {touched && nameError && <p className="text-xs text-warning mt-1" role="alert">{nameError}</p>}</div>
      <div><Input aria-label="Mobile number" placeholder="Mobile number" type="tel" inputMode="tel" autoComplete="tel" value={phone} aria-invalid={touched && !!parsed.error} onChange={e => setPhone(e.target.value)} />
        {touched && parsed.error && <p className="text-xs text-warning mt-1" role="alert">{parsed.error}</p>}
        <p className="text-xs text-muted-foreground mt-1">The shop may call you. Your number is only shared with this shop.</p></div>
      <Input aria-label="Note for the shop (optional)" placeholder="Note for the shop (optional)" maxLength={300} value={note} onChange={e => setNote(e.target.value)} />
      {error && <p className="text-sm text-warning" role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? <><Loader2 className="animate-spin" />Sending…</> : 'Send request'}</Button>
    </form>
  </DialogContent></Dialog>;
}
