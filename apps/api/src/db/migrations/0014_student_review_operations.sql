CREATE TABLE IF NOT EXISTS student_review_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id),
  target_user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('verified', 'rejected')),
  adult_eligible boolean NOT NULL,
  reason text NOT NULL,
  review_cycle integer NOT NULL CHECK (review_cycle > 0),
  verification_id uuid NOT NULL,
  student_snapshot jsonb NOT NULL,
  evidence_snapshot jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('committed', 'acknowledged', 'recovered')),
  committed_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  UNIQUE (operator_id, idempotency_key),
  CHECK (outcome <> 'verified' OR adult_eligible)
);
CREATE INDEX IF NOT EXISTS student_review_operations_pending_idx
  ON student_review_operations (state) WHERE state = 'committed';
CREATE TABLE IF NOT EXISTS student_review_audit (
  operation_id uuid PRIMARY KEY REFERENCES student_review_operations(id),
  operator_id uuid NOT NULL REFERENCES users(id),
  target_user_id uuid NOT NULL REFERENCES users(id),
  outcome text NOT NULL,
  adult_eligible boolean NOT NULL,
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL
);
