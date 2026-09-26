CREATE TABLE IF NOT EXISTS pilot_seat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES ride_offers(id),
  passenger_id uuid NOT NULL REFERENCES users(id),
  driver_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('pending', 'rejected', 'expired')),
  offer_version integer NOT NULL,
  offer_terms jsonb NOT NULL,
  decision_deadline_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (passenger_id <> driver_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pilot_seat_one_pending_pair ON pilot_seat_requests (offer_id, passenger_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS pilot_seat_due ON pilot_seat_requests (decision_deadline_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS pilot_seat_request_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  request_id uuid NOT NULL REFERENCES pilot_seat_requests(id),
  action text NOT NULL CHECK (action IN ('requested', 'rejected')),
  result jsonb NOT NULL,
  request_snapshot jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('committed', 'acknowledged', 'recovered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE (actor_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS pilot_seat_request_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid UNIQUE REFERENCES pilot_seat_request_operations(id),
  request_id uuid NOT NULL REFERENCES pilot_seat_requests(id),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pilot_seat_expiry_audit_once ON pilot_seat_request_audit(request_id,action)
  WHERE action = 'expired';
