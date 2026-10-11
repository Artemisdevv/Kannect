# Apps: Three PWAs and a Landing Page

This replaces the earlier "one deployment, route trees" suggestion. Users are three different kinds of people, so there are three installable apps plus a landing page where they download them.

| App | Folder | Users | Login | Core screens |
|---|---|---|---|---|
| **Landing** | `apps/landing` | Everyone | None | What KadaNet is, three install cards, demo link, privacy/data ownership |
| **Consumer** | `apps/consumer` | Shoppers | None | Search an item, map of nearby shops with In stock / Low / Out, shop page, out-of-stock referral |
| **Retailer** | `apps/retailer` | Shop owners | Phone OTP, role `retailer` | Onboarding (shelf photo, scan + count, starter pack), scan-to-bill, loose-item tiles, stock list, weekly recount, e-bill share, reorder suggestions, place and track supplier orders, receive into stock, group buys, data export |
| **Supplier** | `apps/supplier` | Distributors/wholesalers | Phone OTP, role `supplier` | Profile, wholesale catalogue and prices, incoming orders (accept, reject, dispatch, deliver), invoices, delivery tracking, anonymised demand view, create group buys |

## Why separate PWAs
- A PWA installs per origin and `start_url`. Separate hostnames give each audience its own icon, name and clean install prompt.
- Each app stays small and simple for its audience (a shopper never sees billing, a supplier never sees the shelf scanner).
- Offline matters most in the retailer app; the other two can be lighter.

## Hostnames
Four static sites, one API.

| Site | Example host |
|---|---|
| Landing | `kadanet.example` |
| Consumer | `find.kadanet.example` |
| Retailer | `shop.kadanet.example` |
| Supplier | `supply.kadanet.example` |
| API | `api.kadanet.example` (`/api/v1`) |

Use whatever the hosting gives (for example four Lovable/Netlify/Vercel preview URLs) until a real domain exists. Set each host in the API's `CORS_ORIGINS`. Lovable preview domains are already allowed by regex.

## Install from the landing page
- Each app ships a web manifest (name, icons, `display: standalone`, `start_url`, `scope`) and a service worker.
- Landing page shows three cards, each with an **Install** button that triggers the browser's `beforeinstallprompt`, or a link to the app plus "Add to Home screen" steps for browsers without it (iOS Safari).
- Later: an Android APK per app via Capacitor (Adnan), linked from the same cards. The PWA install is the baseline.
- The e-bill page `/b/:id` is not an app. The API serves it as a light HTML page for customers.

## Repo layout
```
apps/
  landing/    Lovable project, cloned in
  consumer/   Lovable project
  retailer/   Lovable project
  supplier/   Lovable project
packages/
  design/     shared Tailwind/shadcn theme tokens (copy of tokens, not a build dependency)
  api-client/ generated from docs/openapi.yaml (openapi-typescript)
backend/
docs/
```
Each Lovable project is its own repo first. Clone each into its `apps/` folder. Keep the same shadcn theme tokens and API client in all four so they look like one product. Use separate `VITE_API_URL` per app.

## Frontend workload (honest)
This is the largest workstream. Shreyas owns all four sites, built with Lovable on up to three accounts. Priorities, in order:
1. **Retailer** (the demo core: scan, bill, stock drop, onboarding).
2. **Consumer** (the network moment on the map).
3. **Landing** (small, quick, needed for the install story).
4. **Supplier** (largest scope; build on the same components as the retailer app).

If time runs short, cut inside the supplier app (invoices and group buys first), not the retailer or consumer apps.

## Supplier scope (full features, as agreed)
Catalogue and pricing, order lifecycle with tracking, invoices, anonymised demand, group buying. API: `procurement` and `supplier` tags in `openapi.yaml`.

Rules that keep it fair and safe:
- **Demand is anonymised and aggregated.** A product shows only when at least 3 shops contribute. Never name a shop or expose its numbers.
- **AI suggests, owner decides.** Reorder suggestions never place orders automatically.
- **Retailers choose freely.** No supplier gets ranking by payment.
- **Invoices are demo documents.** GST on invoices is an illustrative flat rate and must be labelled as such in the UI.
- **Payments are out of scope.** Invoices have a status field (`unpaid`/`paid`) set by the supplier; no money moves in the app.
