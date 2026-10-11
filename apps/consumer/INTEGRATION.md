# KadaNet Consumer integration

The app currently uses clearly marked demo fixtures. No live API contract or `VITE_API_URL` was supplied.

## Live catalogue
Supply `VITE_API_URL` and the current OpenAPI contract. Replace the transport boundary in `src/lib/shopper.ts` with the exact documented search route and schema; validate responses and add abort-based timeouts there. The UI uses only public shop identity, address, product, price, reported status and update time. Do not pass through private stock counts or retailer fields. Implement the referral endpoint only if present in that contract; otherwise derive in-stock alternatives from search results. A configured URL without a contract intentionally shows an integration error rather than inventing requests.

## Map
No map provider or key is configured. The map toggle intentionally offers an accessible list fallback. Supply a chosen provider and appropriate public key restrictions before adding a real map. Do not send precise shopper coordinates to analytics.

## PWA
The PWA skill governs offline support. `vite-plugin-pwa` generates `/sw.js`, with a single preview-safe registration wrapper, network-first HTML and same-origin hashed-asset caching. Installation/offline behavior must be verified on the published app, not the editor preview. Public search results are session-cached without shopper coordinates; cached availability is explicitly marked stale. Font fallback remains readable without a connection.