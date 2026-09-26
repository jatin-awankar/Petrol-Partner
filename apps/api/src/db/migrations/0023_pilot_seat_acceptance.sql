ALTER TABLE pilot_seat_requests DROP CONSTRAINT pilot_seat_requests_status_check;
ALTER TABLE pilot_seat_requests ADD CONSTRAINT pilot_seat_requests_status_check
  CHECK (status IN ('pending', 'rejected', 'expired', 'accepted', 'withdrawn'));

ALTER TABLE pilot_seat_request_operations DROP CONSTRAINT pilot_seat_request_operations_action_check;
ALTER TABLE pilot_seat_request_operations ADD CONSTRAINT pilot_seat_request_operations_action_check
  CHECK (action IN ('requested', 'rejected', 'accepted'));

CREATE TABLE IF NOT EXISTS pilot_seat_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES pilot_seat_requests(id),
  offer_id uuid NOT NULL REFERENCES ride_offers(id),
  driver_id uuid NOT NULL REFERENCES users(id),
  passenger_id uuid NOT NULL REFERENCES users(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  seats integer NOT NULL DEFAULT 1 CHECK (seats = 1),
  contribution_paise integer NOT NULL CHECK (contribution_paise > 0),
  currency text NOT NULL CHECK (currency = 'INR'),
  offer_version integer NOT NULL,
  policy_version integer NOT NULL,
  departure_at timestamptz NOT NULL,
  commitment_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'held', 'cancelled', 'completed')),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (driver_id <> passenger_id),
  CHECK (commitment_until > departure_at),
  CONSTRAINT pilot_seat_allocations_end_time CHECK (status IN ('confirmed','held') OR ended_at IS NOT NULL)
);
ALTER TABLE pilot_seat_allocations ADD COLUMN IF NOT EXISTS ended_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pilot_seat_allocations_end_time'
    AND conrelid='pilot_seat_allocations'::regclass) THEN
    ALTER TABLE pilot_seat_allocations ADD CONSTRAINT pilot_seat_allocations_end_time
      CHECK (status IN ('confirmed','held') OR ended_at IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS pilot_seat_allocations_offer_active ON pilot_seat_allocations(offer_id)
  WHERE status IN ('confirmed', 'held');
CREATE INDEX IF NOT EXISTS pilot_seat_allocations_passenger_active ON pilot_seat_allocations(passenger_id)
  WHERE status IN ('confirmed', 'held');
CREATE UNIQUE INDEX IF NOT EXISTS pilot_seat_allocations_one_passenger_per_offer
  ON pilot_seat_allocations(offer_id,passenger_id) WHERE status IN ('confirmed','held');

CREATE TABLE IF NOT EXISTS pilot_seat_withdrawal_audit (
  operation_id uuid NOT NULL REFERENCES pilot_seat_request_operations(id),
  request_id uuid NOT NULL REFERENCES pilot_seat_requests(id),
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(operation_id, request_id)
);
