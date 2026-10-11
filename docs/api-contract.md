# KadaNet API Contract (v0.1)

Source of truth: [`openapi.yaml`](./openapi.yaml). This page is the quick read.

**Goal:** frontend and both backend devs work concurrently. Shreyas builds against a mock server from day 1, Aswin and Adnan implement the same spec. Nobody waits.

## Working rules

1. Spec changes go through a PR touching `openapi.yaml`, with a ping to the team. Never change behaviour silently.
2. Frontend mocks from the spec: `npx @stoplight/prism-cli mock docs/openapi.yaml` (runs on :4010). Switch the base URL to the real API when the endpoint lands.
3. Backend returns exactly the spec shapes. Extra fields are fine, missing or renamed ones are not.
4. Validate with `npx @redocly/cli lint docs/openapi.yaml` before merging.

## Conventions

- Base path `/api/v1`, JSON, `Authorization: Bearer <jwt>` for owner endpoints. Public endpoints (`/search`, `/shops/:id`, `/ebills/:id`) need no auth.
- IDs are opaque strings. Money is in **rupees (₹)** as a decimal number with at most 2 places (stored as NUMERIC(10,2)); no paise integers. Times are ISO 8601 UTC.
- **Units:** stock and quantities are integers in base units, `piece` or `gram`. Price is per piece, or per **kg** for gram items. Line total for gram items = `round(price * qty / 1000)`.
- **Stock status:** `in_stock | low | out`. Public endpoints never return exact counts. `stock_qty` appears only on owner endpoints.
- **Idempotency:** bills and stock events carry a client-generated `client_id` (UUID). Resending the same `client_id` returns the existing record (no double decrement). This is what makes offline sync safe.
- **Errors:** `{ "error": { "code": "...", "message": "..." } }` with the right HTTP status. Codes: `invalid_request`, `unauthorized`, `not_found`, `conflict`, `internal`.
- **Onboarding never blocks billing.** A bill with a product not yet in the shop auto-adds it. Rough stock levels (`plenty/some/few/none/unknown`) are accepted instead of exact counts. See [onboarding.md](./onboarding.md).
- **Demo OTP:** `123456` always works until real SMS is wired.
- **AI endpoints only suggest.** The client shows suggestions, the owner confirms, then the client calls the normal bill / stock-event endpoints.

## Endpoint map

| Area | Endpoint | Owner |
|---|---|---|
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify` | Aswin |
| Shop | `POST/GET/PATCH /shop` | Aswin |
| Catalogue | `GET /catalogue/barcode/{barcode}`, `GET/POST /catalogue/products`, `GET /catalogue/starter-packs` | Aswin |
| Shop stock | `GET/POST /shop/products`, `POST /shop/products/bulk`, `PATCH /shop/products/{id}` | Aswin |
| Stock events | `POST /shop/stock-events`, `GET /shop/recount-suggestions` | Aswin |
| Billing | `POST/GET /shop/bills`, `GET /shop/bills/{id}` | Aswin |
| Offline sync | `POST /shop/sync` | Aswin |
| Export | `GET /shop/export` | Aswin |
| Retailer to supplier | `GET /suppliers`, `GET /suppliers/{id}/products`, `GET /shop/reorder-suggestions`, `POST/GET /shop/orders`, `POST /shop/orders/{id}/cancel|receive`, `GET /shop/orders/{id}/invoice`, `GET /group-buys`, `POST /group-buys/{id}/join` | Aswin |
| Supplier app | `POST/GET/PATCH /supplier`, `GET/POST /supplier/products`, `PATCH /supplier/products/{id}`, `GET /supplier/orders`, `POST /supplier/orders/{id}/status`, `GET /supplier/orders/{id}/invoice` | Aswin |
| Supplier insight | `GET /supplier/demand`, `GET/POST /supplier/group-buys` | Adnan |
| Shopper search | `GET /search`, `GET /search/referral`, `GET /shops/{id}` | Adnan |
| E-bill | `GET /ebills/{id}` + HTML page `/b/{id}` | Adnan |
| AI onboarding | `POST /shop/ai/shelf-photo` (headline demo feature) | Adnan |
| AI (nice-to-have) | `POST /shop/ai/invoice`, `POST /shop/ai/voice-bill` | Adnan |

## Cross-team dependencies

- Adnan's search reads the tables Aswin owns. Aswin publishes the schema migration first (issue: schema), Adnan builds on it.
- Stock status derivation (`low_threshold`) is Aswin's logic. Adnan's search reuses a shared DB view or function, not its own copy.
- Shreyas wires the UI to the mock first, then flips to real endpoints per screen.

## Demo flow as API calls

1. `POST /auth/otp/verify` -> token.
2. `GET /catalogue/barcode/8901030…` -> product. `POST /shop/products` to add.
3. `POST /shop/bills` (3 items) -> bill with `share_url`; stock drops.
4. `GET /search?q=soap&lat&lng` -> shops with status, nearest first.
5. Shop runs out -> `GET /search/referral?shop_id&product_id` -> next shop.
6. `GET /shop/export` -> data download.

## Decisions

Settled between Aswin and Adnan. Change via PR, same as the spec.

### Auth tokens (JWT)
- Algorithm **HS256**, signed with `JWT_SECRET`. Always decode with `algorithms=["HS256"]` pinned (rejects `alg: none`).
- Claims: `sub` = owner phone in E.164 (`+919876543210`), `role` = `retailer` or `supplier`, `iss` = `kadanet`, `typ` = `access`, `iat`, `exp` (`JWT_EXPIRE_MINUTES`, default 7 days). No refresh token for the hackathon.
- **No `shop_id` in the token.** A new owner has no shop yet (`verify` returns `shop: null`). The auth dependency resolves the shop from the phone on each request, so creating the shop never requires re-issuing the token. One phone owns one shop for the pilot, so the shop's owner phone must be unique.
- The API refuses to start with `JWT_SECRET=change-me` outside local development.

### Inactive catalogue products
- Barcode lookup, catalogue name search and public search exclude `is_active = false`.
- If an inactive product has `merged_into_id`, follow the chain and return the active product, so old scans keep working.
- A shop's own `GET /shop/products` still lists products it already has, flagged inactive, so history stays visible.
- Bills and stock events keep their references and snapshots. Billing an inactive product with no merge target returns `409 conflict`.
- Products are never hard-deleted (`ON DELETE RESTRICT`).

### Starter packs
- **Data owner: Adnan (#39).** Curated JSON at `data/seed/packs/<shop_type>.json`. Each item: `barcode` (null for loose goods), `name`, `name_ml`, `brand`, `size`, `category`, `unit`, `mrp`, `image_url`, `mrp_source` (`verified` or `demo`). Adnan also supplies the loader that upserts catalogue products and pack membership.
- **Schema and endpoints owner: Aswin (#37).** Membership table (for example `starter_pack_item(shop_type, product_id, position)`), `GET /catalogue/starter-packs` and `POST /shop/products/bulk`. Build against a few fixture rows until real packs land.
- First packs: `grocery` and `provision`.

### Apps and hostnames
- Three PWAs (consumer, retailer, supplier) plus a landing page, each on its own host. See [apps.md](./apps.md).
- Retailer endpoints require role `retailer`, `/supplier/*` requires role `supplier`, `/search`, `/shops/:id`, `/ebills/:id` are public.
- One role per phone for the pilot. The auth dependency resolves the shop (retailer) or supplier (supplier) from the phone.
