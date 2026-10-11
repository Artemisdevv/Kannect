# Kannect Consumer integration

The app reads the live Kannect API. Set `VITE_API_URL` (for example `https://kannect-i9bp.onrender.com/api/v1`); the
default is `http://localhost:8000/api/v1`. Types are generated from `docs/openapi.yaml` with `bun run gen:api`.

## What it calls (all public, no sign-in)
- `GET /search` : shops that stock an item around coordinates or a literal saved-address area (`include_out=true` so "out" shops show and can refer elsewhere)
- `GET /shops/nearby` : shops around coordinates or a literal saved-address area for browsing before any search (shops with no products are left out)
- `GET /shops/{id}` : a shop's public page, products with status only
- `GET /search/referral` : nearest other shop that has the item in stock

Never exposed to the shopper: exact stock counts and any retailer data. Status is only in stock / low / out.
All transport lives in `src/lib/shopper.ts` (+ `src/api/client.ts`); screens do not call `fetch`.

## Where searches start
The shopper's own location if they allow it ("Use my location"), otherwise the selected area is matched as a
case-insensitive substring of each saved shop address. Area searches do not geocode and do not report a distance.
Their position is held only in memory and is never cached; only area-based public results are cached per session.

## Map
Leaflet renders the shop locations supplied by the API on OpenStreetMap tiles. Keep visible OpenStreetMap attribution;
`VITE_MAP_TILE_URL` can select another compatible tile provider. Shops without saved coordinates remain in the
accessible list and have no marker. Do not pre-cache map tiles or send precise shopper coordinates to analytics.

## PWA and Android
`vite-plugin-pwa` generates `/sw.js` (network-first HTML, hashed assets cached). The Android app (Capacitor,
`com.kannect.shopper`) bundles the web build and skips the service worker. Build: `bun run android:sync`, then open
`android/` in Android Studio, or let CI build an APK (`.github/workflows/android.yml`, manual run).
