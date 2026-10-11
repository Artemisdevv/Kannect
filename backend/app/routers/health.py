from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter(tags=["infra"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/health/db")
def health_db(db: Session = Depends(get_db)):
    """Confirms Postgres is reachable and PostGIS is installed."""
    version = db.execute(text("select postgis_version()")).scalar()
    return {"status": "ok", "postgis": version}
