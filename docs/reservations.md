# Reserve for pickup

A shopper asks one shop to set items aside and collects them later. **No payment, no delivery, no shopper account.**

## Flow
1. **Shopper** opens a shop page in the consumer app, taps **Reserve** on items, enters name and phone, sends the request.
   The app keeps a secret token for that request on the phone (the "Requests" tab lists them).
2. **Owner** sees it in the retailer app (Today card, bell, More > Pickup requests) and taps **Accept** (items are held for
   1 to 8 hours) or **Decline** (optional reason the shopper sees).
3. **Shopper** sees "Confirmed, held for you until 4:30 pm" or the decline reason. They can cancel while it is open.
4. **Handover:** the owner taps **Handed over**; this makes a normal bill (payment mode chosen), takes the items off stock
   and creates the e-bill. Stock never changes before that.

## Rules worth knowing
- **A hold is real.** An accepted, unexpired reservation reduces what the next shopper can reserve ("only 7 available"), so
  two people are never promised the last packet. When the hold runs out it shows as `expired` and frees the stock again.
- **Accepting re-checks stock.** If the count dropped meanwhile the owner gets "only N free now, decline or fix the stock".
- **Quantities** are base units: pieces, or grams for loose goods (shown as kg). Limits: 10 lines, 20 pieces or 10 kg per line.
- **Abuse limits** (the phone number is not verified): 3 open requests per phone per shop, 6 per phone overall, 40 pending
  per shop. Anyone can still send a request with a number that is not theirs; the owner decides whether to accept. Real
  verification would need an SMS code per request or a shopper account (not built).
- **The shopper's token** travels in the `X-Reservation-Token` header, never in the URL (URLs are logged). Same answer for
  "no such request" and "wrong token".
- **Retries are safe:** the app sends a `client_id`; sending it again returns the same reservation.

## API (see `docs/openapi.yaml`)
Public: `POST /reservations`, `GET /reservations/{id}`, `POST /reservations/{id}/cancel`.
Owner: `GET /shop/reservations`, `POST /shop/reservations/{id}/accept | decline | collect`.

## Not built (ideas)
- Push or SMS notifications. The shopper page checks every 15 s while open; the owner app checks every 30 s and when you
  come back to it. A shopper who closes the app will not be told.
- Reserving from several shops at once, payments, delivery.

## Database
Migration `0008_pickup_reservations` adds `reservation` and `reservation_line`. **Run it against Supabase before the new API
is deployed:** `cd backend && alembic upgrade head` (with `DATABASE_URL` set to the Supabase session pooler).
