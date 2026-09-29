-- Ticket 12 is isolated from historical corridor requests and allocations.
CREATE TABLE IF NOT EXISTS posted_route_seat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES posted_route_offers(id),
  passenger_id uuid NOT NULL REFERENCES users(id),
  driver_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  route_version integer NOT NULL,
  selection jsonb NOT NULL,
  proposed_terms jsonb NOT NULL,
  decision_deadline_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (passenger_id <> driver_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS posted_route_one_pending_request ON posted_route_seat_requests(offer_id,passenger_id)
  WHERE status='pending';
ALTER TABLE posted_route_seat_requests DROP CONSTRAINT IF EXISTS posted_route_seat_requests_status_check;
ALTER TABLE posted_route_seat_requests ADD CONSTRAINT posted_route_seat_requests_status_check
  CHECK (status IN ('pending','accepted','rejected','withdrawn'));

CREATE TABLE IF NOT EXISTS posted_route_seat_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES posted_route_seat_requests(id),
  offer_id uuid NOT NULL REFERENCES posted_route_offers(id),
  passenger_id uuid NOT NULL REFERENCES users(id),
  driver_id uuid NOT NULL REFERENCES users(id),
  vehicle_declaration_id uuid NOT NULL REFERENCES unrestricted_vehicle_declarations(id),
  seats smallint NOT NULL DEFAULT 1 CHECK (seats=1),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','held','cancelled')),
  accepted_terms jsonb NOT NULL,
  departure_at timestamptz NOT NULL,
  commitment_until timestamptz NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (commitment_until>departure_at),
  CHECK (driver_id<>passenger_id),
  CHECK (accepted_terms ?& ARRAY['route_id','route_version','pickup','dropoff','segment_meters',
    'distance_source','vehicle_category','rate_paise_per_km','rounding_rule','policy_version',
    'currency','total_paise'])
);
CREATE INDEX IF NOT EXISTS posted_route_active_allocations ON posted_route_seat_allocations(offer_id)
  WHERE status IN ('confirmed','held');
CREATE INDEX IF NOT EXISTS posted_route_passenger_commitments ON posted_route_seat_allocations(passenger_id,departure_at,commitment_until)
  WHERE status IN ('confirmed','held');

CREATE OR REPLACE FUNCTION protect_posted_route_accepted_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.accepted_terms IS DISTINCT FROM OLD.accepted_terms OR
     NEW.request_id IS DISTINCT FROM OLD.request_id OR
     NEW.offer_id IS DISTINCT FROM OLD.offer_id OR
     NEW.passenger_id IS DISTINCT FROM OLD.passenger_id OR
     NEW.driver_id IS DISTINCT FROM OLD.driver_id OR
     NEW.vehicle_declaration_id IS DISTINCT FROM OLD.vehicle_declaration_id OR
     NEW.departure_at IS DISTINCT FROM OLD.departure_at OR
     NEW.commitment_until IS DISTINCT FROM OLD.commitment_until THEN
    RAISE EXCEPTION 'accepted route seat terms are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS posted_route_accepted_terms_immutable ON posted_route_seat_allocations;
CREATE TRIGGER posted_route_accepted_terms_immutable BEFORE UPDATE ON posted_route_seat_allocations
  FOR EACH ROW EXECUTE FUNCTION protect_posted_route_accepted_terms();

CREATE TABLE IF NOT EXISTS posted_route_seat_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  request_id uuid NOT NULL REFERENCES posted_route_seat_requests(id),
  action text NOT NULL CHECK (action IN ('requested','accepted','rejected')),
  result jsonb NOT NULL,
  request_snapshot jsonb NOT NULL,
  allocation_snapshot jsonb,
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE(actor_id,idempotency_key)
);
