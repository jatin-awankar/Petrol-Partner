CREATE TABLE IF NOT EXISTS ride_departures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_offer_id uuid NOT NULL UNIQUE REFERENCES ride_offers(id),
  driver_user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  boarded_booking_ids jsonb NOT NULL,
  confirmed_booking_ids jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('committed', 'acknowledged', 'recovered')),
  started_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE (driver_user_id, idempotency_key)
);
ALTER TABLE ride_departures ADD COLUMN IF NOT EXISTS confirmed_booking_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS ride_departure_boarding (
  ride_offer_id uuid NOT NULL REFERENCES ride_offers(id),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
  boarded boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ride_offer_id, booking_id)
);

CREATE TABLE IF NOT EXISTS pilot_ride_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_offer_id uuid NOT NULL REFERENCES ride_offers(id),
  review_operation_id uuid NOT NULL REFERENCES driver_car_review_operations(id),
  priority text NOT NULL CHECK (priority = 'high'),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_offer_id, review_operation_id)
);
