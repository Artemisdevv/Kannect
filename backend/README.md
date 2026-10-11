# KadaNet backend

FastAPI + SQLAlchemy 2 + Postgres/PostGIS. Contract: [`docs/openapi.yaml`](../docs/openapi.yaml).

## Run

```bash
# from repo root
docker compose up -d --build          # db (PostGIS) + api on :8000 with reload
curl localhost:8000/api/v1/health
curl localhost:8000/api/v1/health/db  # confirms PostGIS
```

Interactive docs at http://localhost:8000/docs. Copy `backend/.env.example` to `backend/.env` for local overrides.

## Dev without Docker for the API

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements-dev.txt
docker compose up -d db                           # from repo root
uvicorn app.main:app --reload
ruff check . && pytest
```

## Where things go

| Path | What |
|---|---|
| `app/routers/` | One module per area, mounted in `app/main.py` under `/api/v1`. Paths must match `docs/openapi.yaml` (enforced by `tests/test_contract.py`). |
| `app/models/` | SQLAlchemy models (issue #11), import them in `alembic/env.py`. |
| `alembic/versions/` | Migrations: `alembic revision --autogenerate -m "..."` then `alembic upgrade head`. |
| `app/errors.py` | Error shape `{"error": {"code", "message"}}`. Raise `HTTPException` and it is formatted for you. |

## CORS
Origins from `CORS_ORIGINS`, plus any `*.lovable.app` / `*.lovableproject.com` preview.
