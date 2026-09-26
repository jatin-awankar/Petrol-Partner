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

-- Recovery may replay only a receipt-backed departure or eligibility hold while
-- ordinary protected writes remain fenced. The service restores the operation
-- row from independent evidence before updating the offer.
CREATE OR REPLACE FUNCTION pilot_guard_offer_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'active'
    AND (SELECT mode FROM pilot_recovery_state WHERE singleton = true) = 'restricted' THEN
    IF NEW.status = 'departed' AND EXISTS (
      SELECT 1 FROM ride_departures d WHERE d.ride_offer_id = NEW.id
        AND d.state IN ('recovered', 'acknowledged')
    ) THEN RETURN NEW; END IF;
    IF NEW.status = 'held' AND EXISTS (
      SELECT 1 FROM driver_car_review_operations o
      WHERE o.outcome = 'revoked' AND o.state IN ('recovered', 'acknowledged')
        AND ((o.subject_type = 'driver' AND o.subject_id = NEW.driver_id
          AND EXISTS (SELECT 1 FROM driver_eligibility d
            WHERE d.user_id = NEW.driver_id AND d.status = 'suspended'))
          OR (o.subject_type = 'vehicle' AND o.subject_id = NEW.vehicle_id
          AND EXISTS (SELECT 1 FROM vehicles v
            WHERE v.id = NEW.vehicle_id AND v.verification_status = 'rejected'))
          OR (o.subject_type = 'association' AND EXISTS (
            SELECT 1 FROM driver_vehicle_approvals a WHERE a.id = o.subject_id
              AND a.driver_user_id = NEW.driver_id AND a.vehicle_id = NEW.vehicle_id
              AND a.status = 'revoked')))
    ) THEN RETURN NEW; END IF;
  END IF;
  PERFORM pilot_assert_activity('offers');
  RETURN NEW;
END; $$;
