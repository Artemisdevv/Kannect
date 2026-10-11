from sqlalchemy import create_engine, pool

import app.models  # noqa: F401 -- register every domain model with Base.metadata
from alembic import context
from app.config import get_settings
from app.db import Base

target_metadata = Base.metadata


def _include_object(obj, name, type_, reflected, compare_to):
    # PostGIS system table is not ours
    return not (type_ == "table" and name == "spatial_ref_sys")


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(get_settings().database_url, poolclass=pool.NullPool)
    with engine.connect() as conn:
        context.configure(
            connection=conn, target_metadata=target_metadata, include_object=_include_object
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
