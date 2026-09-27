-- A closure request is a durable instruction, not evidence of erasure.
CREATE TABLE IF NOT EXISTS pilot_account_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT now() + interval '90 days',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','held','provider_failed','ready','completed')),
  last_error_code text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pilot_retention_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid NOT NULL REFERENCES pilot_account_closures(id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope IN ('journey_case','settlement_case','incident','commitment','legal_review')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 8),
  operator_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  review_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by uuid REFERENCES users(id),
  release_key text,
  release_reason text,
  CHECK (review_at > created_at),
  CHECK ((released_at IS NULL AND released_by IS NULL AND release_reason IS NULL AND release_key IS NULL)
    OR (released_at IS NOT NULL AND released_by IS NOT NULL AND release_key IS NOT NULL
      AND length(trim(release_reason)) >= 8))
);
ALTER TABLE pilot_retention_holds ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE pilot_retention_holds ADD COLUMN IF NOT EXISTS release_key text;
UPDATE pilot_retention_holds SET idempotency_key=id::text WHERE idempotency_key IS NULL;
ALTER TABLE pilot_retention_holds ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pilot_retention_hold_idempotency_key
  ON pilot_retention_holds(operator_id,idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS pilot_retention_hold_release_key
  ON pilot_retention_holds(released_by,release_key) WHERE release_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS pilot_retention_holds_active ON pilot_retention_holds(closure_id,review_at)
  WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS pilot_closure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid NOT NULL REFERENCES pilot_account_closures(id) ON DELETE RESTRICT,
  event text NOT NULL CHECK (event IN ('requested','hold_added','hold_released','provider_failed','ready','completed')),
  actor_id uuid REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Receipts contain no user ID, email, object key, or deleted content. The
-- independent restore manifest still needs an approved identification design.
CREATE TABLE IF NOT EXISTS pilot_deletion_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  policy_version text NOT NULL,
  primary_rows integer NOT NULL DEFAULT 0 CHECK (primary_rows >= 0),
  provider_objects integer NOT NULL DEFAULT 0 CHECK (provider_objects >= 0)
);
