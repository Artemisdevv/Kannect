# Supabase Setup (Postgres + PostGIS) and RLS

Supabase hosts the database only. Our FastAPI backend stays the single front door, so frontends never talk to Supabase directly. Not yet tested against a real Supabase project (no access from our side); verify with the checklist at the bottom.

## 1. Create the project
1. New project, pick the region closest to users (Mumbai `ap-south-1` if offered), set a strong database password and keep it.
2. **Dashboard, Database, Extensions: enable `postgis`.** (Migration `0001` also runs `CREATE EXTENSION IF NOT EXISTS postgis`, which is harmless if it is already on.)

## 2. Connection string
Dashboard, Connect, **Session pooler**, copy the string and change the scheme to `postgresql+psycopg://`:

```
DATABASE_URL=postgresql+psycopg://postgres.<project-ref>:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

- Use the **session pooler (port 5432)**. The direct host `db.<ref>.supabase.co` is IPv6-only on the free tier, and the transaction pooler (port 6543) breaks psycopg prepared statements unless we add `prepare_threshold=None`.
- URL-encode special characters in the password (`@` becomes `%40`).

## 3. Environment variables

### Backend (wherever the API runs)
| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | Session pooler string above | yes |
| `APP_ENV` | `production` (the API refuses to start with the default `JWT_SECRET` unless this is `local` or `development`) | yes |
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_hex(32))"` | yes |
| `JWT_EXPIRE_MINUTES` | `10080` (7 days) | no |
| `CORS_ORIGINS` | Comma-separated origins of the four sites (landing, consumer, retailer, supplier). Lovable preview domains are already allowed by regex | yes |
| `PUBLIC_BASE_URL` | Public URL of the API, used to build e-bill `share_url` | yes |
| `DEMO_OTP` | `123456` until real SMS exists | demo |
| `LLM_API_KEY`, `LLM_MODEL` | Gemini key and model for `/shop/ai/*` | for AI endpoints |

### Each frontend (Lovable project)
| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<api-host>/api/v1` |

### Deliberately NOT needed
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: we do not use the Supabase client, Supabase Auth or PostgREST. Auth is our own phone OTP + JWT.
- `SUPABASE_SERVICE_ROLE_KEY`: not used. It bypasses RLS entirely, so **never** put it in any frontend, Lovable project or repo.
- If we later use Supabase Storage for shelf/invoice photos, the API would need `SUPABASE_URL` and the service role key, **server-side only**.

## 4. Run migrations against Supabase
From your machine, with `DATABASE_URL` pointed at Supabase:
```bash
cd backend
alembic upgrade head
```
Run migrations as the `postgres` role (the table owner). Do not run them with the anon or authenticated keys.

## 5. Row level security (RLS)
Supabase exposes the `public` schema through PostgREST to the `anon` and `authenticated` roles. Without RLS, anyone holding the public anon key could read or write our tables.

Migration `0003_enable_rls` does the following:
- Enables RLS on every table in `public` owned by the migration role, with **no policies**. `anon` and `authenticated` therefore get no rows and cannot write.
- Revokes table and sequence privileges from `anon` and `authenticated` (when those roles exist) and from future default privileges.
- Installs an event trigger, `kadanet_auto_rls`, so any table created later is RLS-enabled automatically. If the trigger cannot be created (insufficient privilege), **add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` to every new migration by hand**.

The API connects as `postgres`, which bypasses RLS, so the backend is unaffected. Access control for owners and suppliers is enforced in the API (JWT, role guards, shop/supplier resolved from the phone), not in the database.

Tested locally: all tables show RLS on, a freshly created table gets RLS automatically, downgrade removes the trigger.

## 6. Verify on Supabase (checklist)
- [ ] Dashboard, Database, Tables: every table shows **RLS enabled**, none flagged as unrestricted.
- [ ] Dashboard, Advisors, Security: no "RLS disabled in public" findings.
- [ ] `curl "https://<ref>.supabase.co/rest/v1/shop?select=*" -H "apikey: <anon key>"` returns `[]` or a permission error, never rows.
- [ ] `GET <api>/api/v1/health/db` returns `postgis` version.
- [ ] If the `postgis` extension lives in the `extensions` schema, confirm `alembic upgrade head` still creates the geometry column (the `postgres` role's search path includes `extensions`).
- [ ] Make `spatial_ref_sys` safe: if the advisor flags it (it is extension-owned, so the migration skips it when not the owner), run `ALTER TABLE spatial_ref_sys ENABLE ROW LEVEL SECURITY` as `postgres`, or move PostGIS into the `extensions` schema.
