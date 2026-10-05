-- Forward-only outcome evidence. Existing claims and accepted terms are preserved.
ALTER TABLE posted_route_journey_reviews ADD COLUMN IF NOT EXISTS evidence_refs jsonb;
ALTER TABLE posted_route_journey_reviews ADD COLUMN IF NOT EXISTS resolution_operation_id uuid REFERENCES posted_route_outcome_operations(id);
ALTER TABLE posted_route_settlement_reviews ADD COLUMN IF NOT EXISTS evidence_refs jsonb;
ALTER TABLE posted_route_settlement_reviews ADD COLUMN IF NOT EXISTS resolution_operation_id uuid REFERENCES posted_route_outcome_operations(id);
ALTER TABLE posted_route_outcome_operations DROP CONSTRAINT IF EXISTS posted_route_outcome_operations_action_check;
ALTER TABLE posted_route_outcome_operations ADD CONSTRAINT posted_route_outcome_operations_action_check
  CHECK(action IN ('passenger_cancel','driver_cancel','hold','release_hold','depart','driver_journey',
    'passenger_journey','payment_claim','receipt','dispute','operator_journey','operator_settlement',
    'incident_report','operator_incident','eligibility_hold','eligibility_incident'));
CREATE TABLE IF NOT EXISTS posted_route_outcome_notices (
  entity_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('delayed_departure','journey_silence','payment_overdue','receipt_silence')),
  due_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(entity_id,kind)
);
