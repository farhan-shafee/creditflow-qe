-- Run only in the separately approved, isolated CreditFlow database as migration owner.
-- Set this role's unique password through the provider secret flow, never a committed script.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='creditflow_runtime') THEN
    CREATE ROLE creditflow_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO creditflow_runtime;
GRANT SELECT, INSERT, DELETE ON accounts TO creditflow_runtime;
GRANT UPDATE (outstanding_balance) ON accounts TO creditflow_runtime;
GRANT SELECT, INSERT ON ledger_entries TO creditflow_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO creditflow_runtime;
-- No Flyway history access, schema DDL or UPDATE/DELETE on the ledger.
