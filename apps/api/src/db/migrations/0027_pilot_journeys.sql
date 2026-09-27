CREATE TABLE IF NOT EXISTS pilot_journey_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES ride_offers(id),
  allocation_id uuid REFERENCES pilot_seat_allocations(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('driver_completion','passenger_confirmation')),
  claims jsonb NOT NULL,
  recorded_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz,
  UNIQUE(actor_id,idempotency_key),
  CHECK ((kind='driver_completion' AND allocation_id IS NULL) OR
    (kind='passenger_confirmation' AND allocation_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pilot_journey_one_driver_completion ON pilot_journey_operations(offer_id)
  WHERE kind='driver_completion';
CREATE UNIQUE INDEX IF NOT EXISTS pilot_journey_one_passenger_confirmation ON pilot_journey_operations(allocation_id)
  WHERE kind='passenger_confirmation';

CREATE TABLE IF NOT EXISTS pilot_journey_claims (
  operation_id uuid NOT NULL REFERENCES pilot_journey_operations(id),
  allocation_id uuid NOT NULL REFERENCES pilot_seat_allocations(id),
  actor_role text NOT NULL CHECK (actor_role IN ('driver','passenger')),
  travelled boolean NOT NULL,
  completed boolean NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY(operation_id,allocation_id),
  UNIQUE(allocation_id,actor_role),
  CHECK (NOT completed OR travelled)
);
CREATE TABLE IF NOT EXISTS pilot_contribution_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL UNIQUE REFERENCES pilot_seat_allocations(id),
  driver_claim_operation_id uuid NOT NULL REFERENCES pilot_journey_operations(id),
  passenger_claim_operation_id uuid NOT NULL REFERENCES pilot_journey_operations(id),
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL,
  policy_version integer NOT NULL,
  confirmed_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  CHECK (due_at = confirmed_at + interval '24 hours')
);
CREATE TABLE IF NOT EXISTS pilot_journey_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL UNIQUE REFERENCES pilot_seat_allocations(id),
  reason text NOT NULL CHECK (reason IN ('absence','disagreement','silence','interruption')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL,
  driver_claim_operation_id uuid REFERENCES pilot_journey_operations(id),
  passenger_claim_operation_id uuid REFERENCES pilot_journey_operations(id)
);
-- Keep disposable rehearsal schemas created before absence was made explicit compatible.
ALTER TABLE pilot_journey_reviews DROP CONSTRAINT IF EXISTS pilot_journey_reviews_reason_check;
ALTER TABLE pilot_journey_reviews ADD CONSTRAINT pilot_journey_reviews_reason_check
  CHECK (reason IN ('absence','disagreement','silence','interruption'));
CREATE TABLE IF NOT EXISTS pilot_journey_review_work (
  allocation_id uuid PRIMARY KEY REFERENCES pilot_seat_allocations(id),
  driver_operation_id uuid NOT NULL REFERENCES pilot_journey_operations(id),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','exhausted')),
  attempts integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pilot_journey_review_work_due ON pilot_journey_review_work(due_at)
  WHERE status='pending';
