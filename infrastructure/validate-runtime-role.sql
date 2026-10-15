-- Test fixture only: the caller wraps this and runtime-role.sql in BEGIN/ROLLBACK.
-- Execute through the project-local PostgreSQL service, never a public API.
SET LOCAL ROLE creditflow_runtime;
DO $$
DECLARE
  account_id uuid := gen_random_uuid();
  entry_id uuid := gen_random_uuid();
  denied integer := 0;
BEGIN
  INSERT INTO accounts(id, token_hash, credit_limit, initial_balance, outstanding_balance, expires_at)
  VALUES(account_id, md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 1000, 250, 250, now() + interval '30 minutes');
  UPDATE accounts SET outstanding_balance = 249 WHERE id = account_id;
  INSERT INTO ledger_entries(id, account_id, kind, amount, balance_after, available_after, idempotency_key)
  VALUES(entry_id, account_id, 'PAYMENT', 1, 249, 751, 'runtime-role-probe');
  IF NOT EXISTS(SELECT 1 FROM accounts WHERE id = account_id AND outstanding_balance = 249)
     OR NOT EXISTS(SELECT 1 FROM ledger_entries WHERE id = entry_id) THEN
    RAISE EXCEPTION 'Runtime role could not read its inserted state';
  END IF;

  BEGIN
    UPDATE ledger_entries SET amount = 2 WHERE id = entry_id;
    RAISE EXCEPTION 'Runtime role unexpectedly updated the ledger';
  EXCEPTION WHEN insufficient_privilege THEN denied := denied + 1;
  END;
  BEGIN
    DELETE FROM ledger_entries WHERE id = entry_id;
    RAISE EXCEPTION 'Runtime role unexpectedly deleted from the ledger';
  EXCEPTION WHEN insufficient_privilege THEN denied := denied + 1;
  END;
  BEGIN
    UPDATE accounts SET expires_at = now() WHERE id = account_id;
    RAISE EXCEPTION 'Runtime role unexpectedly updated expiry';
  EXCEPTION WHEN insufficient_privilege THEN denied := denied + 1;
  END;
  BEGIN
    CREATE SCHEMA creditflow_forbidden_probe;
    RAISE EXCEPTION 'Runtime role unexpectedly created a schema';
  EXCEPTION WHEN insufficient_privilege THEN denied := denied + 1;
  END;
  IF denied <> 4 THEN RAISE EXCEPTION 'Runtime permission probes incomplete'; END IF;
  RAISE NOTICE 'CREDITFLOW_RUNTIME_ROLE_VALIDATED: insert, balance update, read allowed; four forbidden operations denied';
END $$;
