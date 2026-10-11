# KadaNet Team Plan

Stack (per `winning_solution.md`): PWA + Capacitor (Android), React + Vite + Tailwind + shadcn/ui, Postgres + PostGIS backend, OpenStreetMap maps, ZXing scanner in PWA / ML Kit in Capacitor.

API contract: [`api-contract.md`](./api-contract.md) and [`openapi.yaml`](./openapi.yaml). Everyone builds against it concurrently.

## Ownership at a glance

| Person | Area | Owns |
|---|---|---|
| **Shreyas** | UI design + wiring | App look and feel (design system, all screens), wiring screens to the API (mock first, then real) |
| **Aswin** | Backend A: shop side | Auth, shops, catalogue, billing, stock events, offline sync, export |
| **Adnan** | Backend B + Android | Infra/deploy, geo search, referral, e-bill, seed data, AI, Capacitor/Android build |
| **Asif** | Pitch, docs, UX testing | Shopkeeper interviews, usability tests, slides, demo script, backup video |

## Day 0 (all together)

Review `openapi.yaml`, agree or amend, then start. Shreyas runs the Prism mock so UI work never waits on backend.

## Shreyas: UI design + wiring

1. **Design system on prebuilt components:** use **shadcn/ui + Tailwind** (Radix primitives) and Lovable for fast screens. Do not hand-build components. Theme tokens only (colours, Malayalam-friendly font such as Noto Sans Malayalam, bigger touch targets). Share a styleguide page early. See `frontend-stack.md`.
2. App shell: PWA scaffold, routing, i18n (ML/EN), API client generated from `openapi.yaml`.
3. **Onboarding flow (least manual work, see `onboarding.md`):** shelf photo + confirm list, scan-one-and-count, starter pack fallback, add-on-first-sale. Then screens, designed and wired: login (OTP), bill screen (continuous scan, manual search, loose-item tiles with quick amounts and stepper), bill confirm + WhatsApp share, stock list, add item by scan.
4. Shopper screens: search, OSM map with In stock / Low / Out, shop page, referral card.
5. Wiring: auth token handling, mock to real endpoint switch per screen, loading/empty/error states.
6. Offline UI: service worker + Dexie queue, sync status indicator, sync call to `/shop/sync`.
7. Nice-to-have: invoice photo screen, voice bill button, weekly recount prompt.

## Aswin: Backend A (shop side)

1. Repo, DB schema and migrations (publish first, Adnan builds on it).
2. Phone OTP auth + JWT (stub OTP).
3. Shared catalogue: barcode lookup, create on first scan (optionally prefill from Open Food Facts).
4. Shop product endpoints.
5. Billing with transactional sale stock events; status derivation (In stock / Low / Out).
6. Event-based stock: restock, correction, conflict flagging, recount suggestions.
7. Idempotent offline sync endpoint.
8. Data export (CSV/JSON).

## Adnan: Backend B + Android

1. Infra: hosted Postgres + PostGIS, env, CI, public API URL, CORS.
2. Neighbourhood search (PostGIS, distance sorted, status only).
3. Out-of-stock referral.
4. E-bill public link page (`/b/:id`).
5. Seed data: 5-10 shops, 40-60 real-barcode products, with low/out cases (with Asif).
5b. **Shelf-photo AI** (`/shop/ai/shelf-photo`): vision LLM extraction, catalogue matching, accuracy scoring on Asif's test set. Promoted to must-have: it is the onboarding headline.
6. **Android:** Capacitor wrap, ML Kit barcode plugin, APK build, test on low-end phone, later push + Bluetooth printer.
7. Nice-to-have AI: invoice OCR, Malayalam voice billing.

## Asif: Pitch, docs, UX testing

1. **No shopkeeper interviews (constraint).** Instead: build a 20-30 photo shelf test set, run a timed onboarding test on a real shelf, desk-research the problem with named sources. See `onboarding.md`.
2. Verify stats, confirm ONDC DigiDukaan / KiranaPro Kerala status.
3. Slide deck, 3-minute demo script, rehearsals, backup demo video.
4. UX testing rounds on a real low-end Android phone, issue log with severity.
5. README, setup docs, privacy/export one-pager. All docs live in `docs/`.
6. Help Adnan choose realistic seed data.

## Phases

| When | Shreyas | Aswin | Adnan | Asif |
|---|---|---|---|---|
| Day 0 | Contract review, Prism mock | Contract review | Contract review, infra | Interviews |
| Phase 1 | Design system, shell, bill screen | Schema, auth, catalogue | Infra, seed data, search | Interviews, stats, deck outline |
| Phase 2 | Shopper screens, offline UI, wire to real API | Billing, stock events, sync | Referral, e-bill, deploy, Capacitor wrap | UX test 1, deck draft |
| Phase 3 | Polish, fixes | Export, conflicts, fixes | APK polish, AI nice-to-haves | UX test 2, rehearsal, backup video |

## Checkpoints

1. End of phase 1: bill screen hits real Aswin endpoints.
2. Mid phase 2: scan, bill, stock drops, shopper map shows the change. Test end to end.
3. Phase 3: feature freeze, bug-bash, rehearse.

Must-haves first. Nice-to-haves only after the full demo loop works.
