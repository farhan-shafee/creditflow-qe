CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  credit_limit numeric(12,2) NOT NULL CHECK (credit_limit > 0 AND credit_limit <= 1000000),
  initial_balance numeric(12,2) NOT NULL CHECK (initial_balance >= 0 AND initial_balance <= credit_limit),
  outstanding_balance numeric(12,2) NOT NULL CHECK (outstanding_balance >= 0 AND outstanding_balance <= credit_limit),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accounts_expiry_idx ON accounts(expires_at);
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind varchar(8) NOT NULL CHECK (kind IN ('PURCHASE','PAYMENT')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  balance_after numeric(12,2) NOT NULL CHECK (balance_after >= 0),
  available_after numeric(12,2) NOT NULL CHECK (available_after >= 0),
  idempotency_key varchar(80) NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(account_id,idempotency_key)
);
CREATE INDEX ledger_history_idx ON ledger_entries(account_id,sequence DESC);
