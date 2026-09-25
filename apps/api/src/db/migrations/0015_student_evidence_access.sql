CREATE TABLE IF NOT EXISTS student_evidence_access_grants (
  token_hash text PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES users(id),
  target_user_id uuid NOT NULL REFERENCES users(id),
  evidence_id uuid NOT NULL REFERENCES student_evidence(id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_evidence_access_expiry_idx
  ON student_evidence_access_grants (expires_at);
