# API layer

Everything the app needs to talk to the backend. Screens import from `@/api` and never call `fetch` themselves.

- `schema.d.ts`: types **generated** from `docs/openapi.yaml`. Regenerate after any spec change: `bun run gen:api`. Do not edit by hand.
- `client.ts`: typed `api` client (openapi-fetch). Base URL from `VITE_API_URL` (default `http://localhost:8000/api/v1`; live: `https://kannect-i9bp.onrender.com/api/v1`). Sends `Authorization: Bearer <token>` automatically and forgets the token on a 401. `unwrap()` returns data or throws `ApiError { status, code, message }`.
- `session.ts`: token + shop, in memory and localStorage. `subscribe`/`getToken`/`getShop` work with `useSyncExternalStore`.
- `endpoints.ts`: one function per call (sign in, shop, products, bills, recount, catalogue, AI photo/voice/invoice, orders). Wrap them in react-query hooks in the screens.
- `scan.ts`: `getScanner().start(videoEl, onCode)` for barcodes, ZXing on the web. The Android build calls `registerNativeScanner(...)` with an ML Kit scanner; screens do not change.

## Flows the endpoints support
- **Login:** `requestOtp(phone)` then `signIn(phone, otp)`. `shop` is null for a new owner: show the shop form and call `createShop`.
- **Scan a barcode:** `lookupBarcode(code)`. `null` means unknown, so call `createProduct(...)`. If it returns `{ created: false, similar }`, show those products and let the owner pick one, or call `createProduct(..., true)` to add it anyway.
- **Photo onboarding:** `shelfPhoto([...])` suggests items; the owner confirms; `addShopProductsBulk`. Items with `in_shop: true` were already stocked: offer a recount with `recount` instead.
- **Recount:** `recount({ items: [{ client_id, product_id, quantity | stock_level, count_source }] })`. An exact count from a scan always applies; a photo estimate that matches the current stock band is skipped.
- **Voice bill:** `voiceBill(blob)` returns `suggestions`; show the transcript and lines, the owner fixes them, then `createBill`.
- Money is rupees; quantities are base units (pieces, or grams for loose goods priced per kg). Use a fresh `crypto.randomUUID()` as `client_id` per bill or recount item, and reuse it on retry.
