CREATE TABLE IF NOT EXISTS posted_route_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES posted_route_offers(id),
  allocation_id uuid REFERENCES posted_route_seat_allocations(id),
  reported_by uuid NOT NULL REFERENCES users(id),
  operation_id uuid NOT NULL UNIQUE REFERENCES posted_route_outcome_operations(id),
  kind text NOT NULL CHECK (kind IN ('attempted_cancellation','absence','interruption','safety','disagreement')),
  reason text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('routine','high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES users(id),
  resolution_operation_id uuid UNIQUE REFERENCES posted_route_outcome_operations(id),
  resolution_reason text,
  evidence_refs jsonb,
  resolved_at timestamptz
);
ALTER TABLE posted_route_incidents ADD COLUMN IF NOT EXISTS resolution_operation_id uuid
  UNIQUE REFERENCES posted_route_outcome_operations(id);
ALTER TABLE posted_route_outcome_operations DROP CONSTRAINT IF EXISTS posted_route_outcome_operations_action_check;
ALTER TABLE posted_route_outcome_operations ADD CONSTRAINT posted_route_outcome_operations_action_check
  CHECK (action IN ('passenger_cancel','driver_cancel','hold','release_hold','depart',
    'driver_journey','passenger_journey','payment_claim','receipt','dispute','operator_journey',
    'operator_settlement','incident_report','operator_incident'));
