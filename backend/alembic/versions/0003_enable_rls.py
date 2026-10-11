# ruff: noqa: E501
"""Enable row level security on every public table (Supabase).

Revision ID: 0003_enable_rls
Revises: 0002_unique_shop_phone
Create Date: 2026-10-11

Why: Supabase exposes the public schema over PostgREST with the anon/authenticated roles.
All KadaNet access goes through our FastAPI backend, which connects with the table-owner role
(that role bypasses RLS). So RLS is switched on with NO policies: anon/authenticated get
nothing, and a leaked anon key cannot read or write any data.

Also:
- revokes table privileges from anon/authenticated when those roles exist (no-op locally)
- installs an event trigger so tables created by future migrations get RLS automatically
"""

from alembic import op

revision = "0003_enable_rls"
down_revision = "0002_unique_shop_phone"
branch_labels = None
depends_on = None

ENABLE_ALL = """
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname = 'public' AND tableowner = current_user
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;
END $$;
"""

REVOKE_API_ROLES = """
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END $$;
"""

AUTO_RLS_FN = """
CREATE OR REPLACE FUNCTION public.kadanet_auto_enable_rls() RETURNS event_trigger
LANGUAGE plpgsql AS $$
DECLARE cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE' AND schema_name = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
  END LOOP;
END $$;
"""

AUTO_RLS_TRIGGER = """
DO $$
BEGIN
  DROP EVENT TRIGGER IF EXISTS kadanet_auto_rls;
  CREATE EVENT TRIGGER kadanet_auto_rls ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.kadanet_auto_enable_rls();
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Cannot create event trigger here; add ENABLE ROW LEVEL SECURITY in new migrations by hand';
END $$;
"""


def upgrade() -> None:
    op.execute(ENABLE_ALL)
    op.execute(REVOKE_API_ROLES)
    op.execute(AUTO_RLS_FN)
    op.execute(AUTO_RLS_TRIGGER)


def downgrade() -> None:
    op.execute("DROP EVENT TRIGGER IF EXISTS kadanet_auto_rls")
    op.execute("DROP FUNCTION IF EXISTS public.kadanet_auto_enable_rls()")
    op.execute(
        """
        DO $$
        DECLARE t record;
        BEGIN
          FOR t IN SELECT schemaname, tablename FROM pg_tables
                   WHERE schemaname = 'public' AND tableowner = current_user
          LOOP
            EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
          END LOOP;
        END $$;
        """
    )
