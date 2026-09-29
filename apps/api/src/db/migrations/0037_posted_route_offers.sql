-- Isolated route offers. No foreign key into historical corridor ride_offers.
CREATE TABLE IF NOT EXISTS posted_route_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES users(id),
  vehicle_declaration_id uuid NOT NULL REFERENCES unrestricted_vehicle_declarations(id),
  route_version integer NOT NULL DEFAULT 1 CHECK (route_version > 0),
  policy_version text NOT NULL,
  routing_source text NOT NULL,
  routing_mode text NOT NULL CHECK (routing_mode IN ('bike','scooter','car')),
  geometry jsonb NOT NULL,
  distance_meters integer NOT NULL CHECK (distance_meters > 0 AND distance_meters <= 50000),
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 5400),
  departure_at timestamptz NOT NULL,
  commitment_until timestamptz NOT NULL,
  request_cutoff_at timestamptz NOT NULL,
  acceptance_cutoff_at timestamptz NOT NULL,
  capacity smallint NOT NULL CHECK (capacity BETWEEN 1 AND 8),
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (commitment_until > departure_at),
  CHECK (request_cutoff_at < acceptance_cutoff_at AND acceptance_cutoff_at < departure_at)
);
CREATE INDEX IF NOT EXISTS posted_route_driver_window ON posted_route_offers(driver_id,departure_at,commitment_until) WHERE status='prepared';
CREATE INDEX IF NOT EXISTS posted_route_vehicle_window ON posted_route_offers(vehicle_declaration_id,departure_at,commitment_until) WHERE status='prepared';
CREATE TABLE IF NOT EXISTS posted_route_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  offer_id uuid NOT NULL REFERENCES posted_route_offers(id),
  result jsonb NOT NULL,
  offer_snapshot jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE(actor_id,idempotency_key)
);
