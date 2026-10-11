# KadaNet

KadaNet is a prototype for helping neighbourhood kirana shops manage billing and stock, connect with suppliers, and help nearby shoppers find products. The repository is named **Temp-SOC**, while the product and project documentation call it **KadaNet**.

The project is designed around three installable progressive web apps (PWAs) and a landing page:

| App | Audience | Intended use |
| --- | --- | --- |
| Consumer | Shoppers | Search for products, see nearby shops and public stock status, and find another shop when an item is unavailable |
| Retailer | Kirana shop owners | Onboard stock, scan and bill items, track inventory, share e-bills, and manage supplier orders |
| Supplier | Distributors and wholesalers | Maintain a wholesale catalogue, manage orders, and view privacy-preserving demand summaries |
| Landing page | Everyone | Explain the product and link to the three apps |

## Product principles

- **Stock visibility without exposing counts:** shoppers see only **In stock**, **Low**, or **Out**. Exact quantities are reserved for the shop owner.
- **Owner stays in control:** AI may suggest product matches, stock counts, and reorders; the owner reviews and confirms them.
- **Low-friction onboarding:** the planned flow starts with a shelf photo and confirmation list, then offers barcode scan-and-count and starter packs as alternatives.
- **Offline-aware retail workflows:** the retailer app is planned to queue bills locally and sync them safely when connectivity returns.
- **Privacy-preserving supplier insights:** demand is aggregated, and a product is shown only when at least three shops contribute. Shop identities and small-group counts are not exposed.
- **No in-app payments:** supplier orders and illustrative invoices are in scope; moving money through the app is not.

## Current implementation

The repository currently contains the backend foundation: a FastAPI service with health checks, phone OTP/JWT authentication, and catalogue endpoints, plus SQLAlchemy models, Alembic migrations, and a Docker Compose setup with Postgres/PostGIS.

The three app frontends and much of the product workflow are described in the project docs and GitHub issues, but are not present in this repository yet. Billing, stock sync, public shopper search, supplier ordering, and AI onboarding are part of the product plan/API contract and should not be assumed to be fully implemented.

## Technology

- **Backend:** Python, FastAPI, SQLAlchemy 2, Alembic
- **Database:** PostgreSQL with PostGIS
- **API:** JSON over `/api/v1`, specified in [docs/openapi.yaml](docs/openapi.yaml)
- **Frontend plan:** React, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Maps and scanning plan:** Leaflet/OpenStreetMap, ZXing for browser barcode scanning
- **Offline and Android plan:** Workbox or vite-plugin-pwa, Dexie, and Capacitor

The API contract and product decisions are in [docs/api-contract.md](docs/api-contract.md). See [docs/apps.md](docs/apps.md) for the app responsibilities, [docs/onboarding.md](docs/onboarding.md) for the onboarding flow, and [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md) for the project plan.

## Run locally

### Prerequisites

- Docker and Docker Compose
- Git

### Start the API and database

From the repository root:

```bash
git clone https://github.com/Artemisdevv/Temp-SOC.git
cd Temp-SOC
docker compose up -d --build
```

The API listens at [http://localhost:8000](http://localhost:8000). Interactive API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

Check the service and database health:

```bash
curl http://localhost:8000/api/v1/health
curl http://localhost:8000/api/v1/health/db
```

For local environment overrides, copy `backend/.env.example` to `backend/.env`. The Compose configuration provides local database defaults. The documented demo OTP is `123456`; it is for development/demo use only. Set a strong `JWT_SECRET` and production environment settings before deploying.

### Run the backend without Docker

The database still needs to be available (for example, start only the database service from the repository root with `docker compose up -d db`).

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\\Scripts\\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

## Repository layout

```text
backend/
  app/                 FastAPI app, authentication, models, and routers
  alembic/             Database migrations
  scripts/             Catalogue and shelf-vision utilities
  tests/               Backend tests
docs/
  openapi.yaml         API specification
  api-contract.md      API conventions and decisions
  apps.md              Consumer, retailer, supplier, and landing-page scope
  onboarding.md        Retailer onboarding design
  supabase.md          Postgres/PostGIS deployment and RLS notes
ml/                    Catalogue indexing and detection/matching utilities
docker-compose.yml     Local API and Postgres/PostGIS services
```

The separate app projects are not checked into this repository at present; see [docs/apps.md](docs/apps.md) for their planned structure.

## API and development

- API base path: `/api/v1`
- Interactive docs: `/docs` when the API is running
- OpenAPI source of truth: [docs/openapi.yaml](docs/openapi.yaml)
- API quick reference: [docs/api-contract.md](docs/api-contract.md)
- The API uses bearer JWTs for owner endpoints. Public endpoints in the contract do not require authentication.
- Money is represented in rupees, and public stock responses use status labels rather than exact counts.
- Bill and stock-event operations are designed to use client-generated IDs for safe retries during offline sync.

Backend development notes and commands are in [backend/README.md](backend/README.md). The project plan includes linting the API spec with `npx @redocly/cli lint docs/openapi.yaml`; backend test and lint commands are documented in [backend/README.md](backend/README.md).

## Planned product workflow

1. A retailer adds stock with a shelf-photo estimate, barcode scan and count, or a starter pack, then reviews and confirms the result.
2. The retailer scans or searches items, creates a bill, and stock is adjusted.
3. A shopper searches for an item and sees nearby shops with broad stock status.
4. When a shop is out, the shopper can be referred to another nearby shop with the item.
5. Low-stock signals can support retailer-approved reorder suggestions and supplier orders.
6. Suppliers manage catalogue, order status, invoices, and anonymised demand; group buys are also in the project scope.

These are the documented product goals. See the current implementation note above and the issue tracker for delivery status.

## Security and data handling

- Never commit real credentials or `.env` files.
- The demo OTP and local database credentials in the development configuration are not production credentials.
- Keep `JWT_SECRET` private and use a generated secret outside local development.
- The FastAPI backend is intended to be the single frontend entry point; frontends should not connect directly to Supabase.
- AI results are suggestions that require owner confirmation.

Read [docs/supabase.md](docs/supabase.md) before configuring Supabase. That document notes that deployment against a real Supabase project still needs verification.

## Contributing

Check the API contract and relevant project docs before changing behavior. Changes to the API specification should update `docs/openapi.yaml` through a pull request and keep the backend and clients aligned with it. Open an issue to discuss larger changes.

## License

No license is currently specified in this repository. Until one is added, reuse and redistribution are not granted by this README.

