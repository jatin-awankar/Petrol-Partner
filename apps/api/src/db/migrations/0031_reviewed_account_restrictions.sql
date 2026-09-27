CREATE TABLE IF NOT EXISTS pilot_account_restriction_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id),
  target_user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  action text NOT NULL CHECK (action IN ('restrict','reverse')),
  scope text NOT NULL CHECK (scope IN ('driver','passenger','all')),
  source_type text NOT NULL CHECK (source_type IN ('incident','settlement')),
  source_id uuid NOT NULL,
  reason text NOT NULL,
  reviewed_evidence text NOT NULL,
  reverses_id uuid REFERENCES pilot_account_restriction_operations(id),
  effect_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  committed_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz,
  UNIQUE(operator_id,idempotency_key),
  CHECK ((action='restrict' AND reverses_id IS NULL) OR
    (action='reverse' AND reverses_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pilot_account_restriction_one_reversal
  ON pilot_account_restriction_operations(reverses_id) WHERE action='reverse';
CREATE INDEX IF NOT EXISTS pilot_account_restriction_target
  ON pilot_account_restriction_operations(target_user_id,committed_at DESC);

ALTER TABLE pilot_revocation_holds DROP CONSTRAINT IF EXISTS pilot_revocation_holds_subject_type_check;
ALTER TABLE pilot_revocation_holds ADD CONSTRAINT pilot_revocation_holds_subject_type_check
  CHECK (subject_type IN ('student','driver','vehicle','association','restriction'));
ALTER TABLE pilot_revocation_incidents DROP CONSTRAINT IF EXISTS pilot_revocation_incidents_subject_type_check;
ALTER TABLE pilot_revocation_incidents ADD CONSTRAINT pilot_revocation_incidents_subject_type_check
  CHECK (subject_type IN ('student','driver','vehicle','association','restriction'));
