CREATE TABLE IF NOT EXISTS pilot_journey_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES pilot_journey_reviews(id),
  operator_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('travelled_completed','did_not_travel','interrupted','insufficient_evidence')),
  contribution_owed boolean,
  reason text NOT NULL,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  decided_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz,
  UNIQUE(operator_id,idempotency_key),
  CHECK ((outcome='insufficient_evidence' AND contribution_owed IS NULL) OR
    (outcome='did_not_travel' AND contribution_owed=false) OR
    (outcome IN ('travelled_completed','interrupted') AND contribution_owed IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pilot_journey_review_final_decision
  ON pilot_journey_review_decisions(review_id) WHERE outcome<>'insufficient_evidence';
ALTER TABLE pilot_contribution_obligations ALTER COLUMN driver_claim_operation_id DROP NOT NULL;
ALTER TABLE pilot_contribution_obligations ALTER COLUMN passenger_claim_operation_id DROP NOT NULL;
ALTER TABLE pilot_contribution_obligations ADD COLUMN IF NOT EXISTS review_decision_id uuid
  REFERENCES pilot_journey_review_decisions(id);
ALTER TABLE pilot_contribution_obligations DROP CONSTRAINT IF EXISTS pilot_obligation_source_check;
ALTER TABLE pilot_contribution_obligations ADD CONSTRAINT pilot_obligation_source_check CHECK (
  (review_decision_id IS NULL AND driver_claim_operation_id IS NOT NULL AND passenger_claim_operation_id IS NOT NULL)
  OR (review_decision_id IS NOT NULL AND driver_claim_operation_id IS NULL AND passenger_claim_operation_id IS NULL));
