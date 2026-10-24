CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  google_sub text NOT NULL UNIQUE,
  email text NOT NULL,
  name text NOT NULL,
  picture text,
  wallet_address text UNIQUE,
  wallet_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash text PRIMARY KEY,
  code_verifier text NOT NULL,
  return_to text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address text NOT NULL,
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_challenges_user_idx ON wallet_challenges(user_id);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  plan text NOT NULL CHECK (plan IN ('pro', 'team')),
  amount_idr integer NOT NULL CHECK (amount_idr > 0),
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  payment_id text UNIQUE,
  payment_url text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  owner_user_id uuid PRIMARY KEY REFERENCES users(id),
  plan text NOT NULL CHECK (plan IN ('free', 'pro', 'team')),
  status text NOT NULL CHECK (status IN ('active', 'expired')),
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  last_invoice_id uuid REFERENCES invoices(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  object_key text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  file_hash text NOT NULL,
  commitment text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'ready', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS print_orders (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  document_id uuid NOT NULL UNIQUE REFERENCES documents(id),
  token_hash text NOT NULL UNIQUE,
  pin_hash text NOT NULL,
  options jsonb NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('draft', 'shared', 'opened', 'processing', 'printed', 'failed', 'expired', 'revoked')),
  grant_id text UNIQUE,
  grant_nonce numeric(78,0),
  chain_tx_hash text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS print_orders_owner_idx ON print_orders(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS handoff_tickets (
  ticket_hash text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES print_orders(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pin_attempts (
  token_hash text NOT NULL,
  ip_hash text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pin_attempts_recent_idx ON pin_attempts(token_hash,ip_hash,attempted_at DESC);

CREATE TABLE IF NOT EXISTS deletion_attestations (
  document_id uuid PRIMARY KEY REFERENCES documents(id),
  order_id uuid REFERENCES print_orders(id),
  object_deleted_at timestamptz NOT NULL,
  evidence_hash text NOT NULL,
    print_mode text NOT NULL DEFAULT 'operator_attested' CHECK (print_mode IN ('operator_attested', 'virtual_pdf_test')),
    virtual_output_hash text,
  chain_tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
