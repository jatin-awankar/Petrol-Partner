-- New unrestricted self-declarations are independent of historical PRMITR reviews.
CREATE TABLE IF NOT EXISTS adult_declarations (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  declared_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  operation_id uuid NOT NULL UNIQUE,
  CHECK (expires_at > declared_at),
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= declared_at)
);
CREATE TABLE IF NOT EXISTS adult_declaration_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  action text NOT NULL CHECK (action IN ('declare','withdraw')),
  policy_version text NOT NULL,
  declared_at timestamptz,
  expires_at timestamptz,
  withdrawn_at timestamptz,
  committed_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz,
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS adult_declaration_operations_user_time ON adult_declaration_operations(user_id,committed_at DESC);
