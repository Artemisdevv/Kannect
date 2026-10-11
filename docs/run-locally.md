# Run everything locally

Backend and database in Docker, frontend with the normal dev server. Tested on Windows with Docker Desktop.

## 1. Backend + database (Docker)

From the repo root:

```bash
docker compose up -d --build        # PostGIS db on :5432, API on :8000 (auto-reloads on code changes)
docker compose exec api alembic upgrade head
```

The first time, `backend/.env` is optional: the API container always uses the local database
(`DATABASE_URL` is set in `docker-compose.yml`). Create `backend/.env` from `backend/.env.example` if you
need the AI endpoints (`LLM_API_KEY`) or a non-default `DEMO_OTP`.

Check: http://localhost:8000/api/v1/health/db shows PostGIS, http://localhost:8000/docs is Swagger.

**Run migrations again whenever the head changes** (a PR with a new file in `backend/alembic/versions/`).

### Seed demo data (once, from `backend/`)

The database starts empty. Seeds are run from your machine, so **set `DATABASE_URL` to the local database in
the same command**, otherwise a `.env` that points at Supabase would be used.

```bash
cd backend
export DATABASE_URL="postgresql+psycopg://kadanet:kadanet@localhost:5432/kadanet" APP_ENV=local
python scripts/seed_catalogue.py --apply       # ~11.6k Open Food Facts products (needs data/seed/off_candidates.jsonl)
python scripts/load_packs.py --apply           # starter packs, MRPs, loose items (tomato, onion, ...)
python scripts/seed_demo.py --apply            # 8 demo shops + 3 suppliers around Kaloor, Kochi
python scripts/seed_demo_suppliers.py --apply  # supplier catalogues + a group buy
export DEMO_OTP=...                            # only if your .env sets one: the script logs in through the API
python scripts/seed_demo_orders.py --apply     # orders + invoices through the running API
```

(PowerShell: `$env:DATABASE_URL="..."; $env:APP_ENV="local"` instead of `export`.)

Demo logins: retailers `+919000000001` to `+919000000008`, suppliers `+919000000101` to `+919000000103`. OTP is
`123456` unless `DEMO_OTP` is set in `backend/.env`.

`data/seed/off_candidates.jsonl` is gitignored; ask Adnan for it or run `scripts/harvest_off.py`.

### Tests

```bash
cd backend
python -m pytest -q
# real-Postgres integration tests (local db only, they refuse other hosts):
DATABASE_URL="postgresql+psycopg://kadanet:kadanet@localhost:5432/kadanet" APP_ENV=local RUN_INTEGRATION=1 python -m pytest tests/integration -q
```

### Useful

```bash
docker compose logs -f api         # API logs
docker compose down                # stop (data kept in the dbdata volume)
docker compose down -v             # stop and DELETE the local database
```

## 2. Retailer app (plain Vite, no Docker)

```bash
cd apps/retailer
bun install        # or: npm install
bun run dev        # or: npm run dev   -> http://localhost:5173
```

The app talks to `http://localhost:8000/api/v1` by default. To point it elsewhere, create
`apps/retailer/.env.local`:

```
VITE_API_URL=https://kannect-i9bp.onrender.com/api/v1
```

CORS allows `http://localhost:5173` and `http://localhost:8080` by default; add other origins with
`CORS_ORIGINS` in `backend/.env`.

Other commands: `bun run build` (static `dist/`), `bun run test`, `bun run gen:api` (regenerate API types after
`docs/openapi.yaml` changes).

## Gotchas
- **Never run a seed script without `DATABASE_URL` set to the local database** if `backend/.env` points at Supabase.
- Port 5432 busy? A local Postgres is already running; stop it or change the port in `docker-compose.yml`.
- The Render demo (`kannect-i9bp.onrender.com`) sleeps when idle and may be behind `main`; it needs a manual
  deploy and, for new migrations, `alembic upgrade head` against Supabase from a dev machine first.
