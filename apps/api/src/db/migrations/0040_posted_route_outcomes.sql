-- Synthetic route-booking lifecycle. Historical corridor records are untouched.
ALTER TABLE posted_route_offers DROP CONSTRAINT IF EXISTS posted_route_offers_status_check;
ALTER TABLE posted_route_offers ADD CONSTRAINT posted_route_offers_status_check
  CHECK (status IN ('prepared','held','cancelled','departed'));
ALTER TABLE posted_route_seat_allocations ADD COLUMN IF NOT EXISTS boarded boolean;
CREATE TABLE IF NOT EXISTS posted_route_outcome_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  offer_id uuid NOT NULL REFERENCES posted_route_offers(id),
  allocation_id uuid REFERENCES posted_route_seat_allocations(id),
  action text NOT NULL CHECK (action IN ('passenger_cancel','driver_cancel','hold','release_hold','depart',
    'driver_journey','passenger_journey','payment_claim','receipt','dispute','operator_journey','operator_settlement')),
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE(actor_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS posted_route_journey_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES posted_route_seat_allocations(id),
  operation_id uuid NOT NULL REFERENCES posted_route_outcome_operations(id),
  role text NOT NULL CHECK (role IN ('driver','passenger')),
  travelled boolean NOT NULL,
  completed boolean NOT NULL,
  UNIQUE(allocation_id,role),
  CHECK (NOT completed OR travelled)
);
CREATE TABLE IF NOT EXISTS posted_route_journey_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL UNIQUE REFERENCES posted_route_seat_allocations(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  outcome text,
  resolution_reason text,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS posted_route_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL UNIQUE REFERENCES posted_route_seat_allocations(id),
  amount_paise integer NOT NULL CHECK (amount_paise>=0),
  currency text NOT NULL CHECK (currency='INR'),
  policy_version text NOT NULL,
  accepted_route_version integer NOT NULL,
  accepted_segment jsonb NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours')
);
CREATE TABLE IF NOT EXISTS posted_route_payment_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL UNIQUE REFERENCES posted_route_obligations(id),
  operation_id uuid NOT NULL REFERENCES posted_route_outcome_operations(id),
  method text NOT NULL CHECK (method IN ('cash','upi')),
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS posted_route_receipt_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL UNIQUE REFERENCES posted_route_payment_claims(id),
  operation_id uuid NOT NULL REFERENCES posted_route_outcome_operations(id),
  kind text NOT NULL CHECK (kind IN ('receipt','dispute')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS posted_route_settlement_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL UNIQUE REFERENCES posted_route_obligations(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  receipt_established boolean,
  resolution_reason text,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz
);
