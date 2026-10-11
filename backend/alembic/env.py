from sqlalchemy import create_engine

from alembic import context
from app.config import get_settings
from app.db import Base

# Import models here (or in app/models/__init__.py) so autogenerate sees them:
# import app.models  # noqa: F401

target_metadata = Base.metadata


def _include_object(obj, name, type_, reflected, compare_to):
    # PostGIS system table is not ours
    return not (type_ == "table" and name == "spatial_ref_sys")


def run_migrations_online() -> None:
    engine = create_engine(get_settings().database_url)
    with engine.connect() as conn:
        context.configure(
            connection=conn, target_metadata=target_metadata, include_object=_include_object
        )
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
