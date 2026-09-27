ALTER TABLE pilot_settlement_reviews ADD COLUMN IF NOT EXISTS participant_report_id uuid;
CREATE TABLE IF NOT EXISTS pilot_settlement_case_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES pilot_contribution_obligations(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('report','decision')),
  contribution_owed boolean,
  receipt_established boolean,
  case_resolution text CHECK (case_resolution IN ('resolved','unresolved')),
  reason text NOT NULL,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  participant_confirmation_id uuid REFERENCES pilot_settlement_operations(id),
  recorded_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz,
  UNIQUE(actor_id,idempotency_key),
  CHECK ((kind='report' AND contribution_owed IS NULL AND receipt_established IS NULL
    AND case_resolution IS NULL AND participant_confirmation_id IS NULL)
    OR (kind='decision' AND case_resolution IS NOT NULL)),
  CHECK (receipt_established IS DISTINCT FROM true OR
    (participant_confirmation_id IS NOT NULL OR cardinality(evidence_refs)>0))
);
ALTER TABLE pilot_settlement_case_operations ADD COLUMN IF NOT EXISTS receipt_basis text;
ALTER TABLE pilot_settlement_case_operations ADD COLUMN IF NOT EXISTS reviewed_evidence_summary text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pilot_settlement_final_findings_check') THEN
    ALTER TABLE pilot_settlement_case_operations ADD CONSTRAINT pilot_settlement_final_findings_check
      CHECK (case_resolution IS DISTINCT FROM 'resolved' OR
        (contribution_owed IS NOT NULL AND receipt_established IS NOT NULL)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pilot_settlement_receipt_basis_check') THEN
    ALTER TABLE pilot_settlement_case_operations ADD CONSTRAINT pilot_settlement_receipt_basis_check
      CHECK (receipt_established IS DISTINCT FROM true OR
        (receipt_basis='participant_confirmation' AND participant_confirmation_id IS NOT NULL
          AND cardinality(evidence_refs)=0 AND reviewed_evidence_summary IS NULL) OR
        (receipt_basis='reviewed_evidence' AND participant_confirmation_id IS NULL
          AND cardinality(evidence_refs)>0 AND coalesce(length(trim(reviewed_evidence_summary)),0)>=8)) NOT VALID;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS pilot_settlement_one_participant_report
  ON pilot_settlement_case_operations(obligation_id,actor_id) WHERE kind='report';
CREATE UNIQUE INDEX IF NOT EXISTS pilot_settlement_one_final_decision
  ON pilot_settlement_case_operations(obligation_id) WHERE kind='decision' AND case_resolution='resolved';
ALTER TABLE pilot_settlement_reviews ADD COLUMN IF NOT EXISTS final_decision_id uuid
  REFERENCES pilot_settlement_case_operations(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pilot_settlement_review_final_consistency') THEN
    ALTER TABLE pilot_settlement_reviews ADD CONSTRAINT pilot_settlement_review_final_consistency
      CHECK ((status='resolved')=(final_decision_id IS NOT NULL));
  END IF;
END $$;
