CREATE TABLE IF NOT EXISTS pilot_departure_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL UNIQUE REFERENCES ride_offers(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  driver_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('departure','late_departure')),
  reason text,
  boarded_allocation_ids jsonb NOT NULL,
  confirmed_allocation_ids jsonb NOT NULL,
  started_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz,
  UNIQUE (actor_id,idempotency_key),
  CHECK ((kind='late_departure' AND reason IS NOT NULL) OR
    (kind='departure' AND reason IS NULL))
);

CREATE TABLE IF NOT EXISTS pilot_departure_boarding (
  operation_id uuid NOT NULL REFERENCES pilot_departure_operations(id),
  allocation_id uuid NOT NULL UNIQUE REFERENCES pilot_seat_allocations(id),
  boarded boolean NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (operation_id,allocation_id)
);

CREATE TABLE IF NOT EXISTS pilot_departure_review_signals (
  operation_id uuid NOT NULL REFERENCES pilot_departure_operations(id),
  allocation_id uuid NOT NULL REFERENCES pilot_seat_allocations(id),
  signal_type text NOT NULL CHECK (signal_type='absence'),
  created_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  PRIMARY KEY(operation_id,allocation_id)
);

CREATE TABLE IF NOT EXISTS pilot_delayed_ride_notices (
  offer_id uuid PRIMARY KEY REFERENCES ride_offers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A receipt-backed pilot departure can be replayed while writes are fenced.
CREATE OR REPLACE FUNCTION pilot_guard_offer_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (SELECT mode FROM pilot_recovery_state WHERE singleton = true) = 'restricted' THEN
    IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM pilot_offer_operations o
      WHERE o.offer_id = NEW.id AND o.state = 'recovered' AND o.action = 'published'
        AND (o.offer_snapshot = to_jsonb(NEW)
          OR o.offer_snapshot = to_jsonb(NEW) - 'pilot_replaces_offer_id'))
    THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM pilot_offer_operations o
      WHERE o.offer_id = NEW.id AND o.state = 'recovered' AND o.action = 'updated'
        AND (o.offer_snapshot = to_jsonb(NEW)
          OR o.offer_snapshot = to_jsonb(NEW) - 'pilot_replaces_offer_id'))
    THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('active','held') THEN
    IF NEW.status = 'cancelled' AND EXISTS (
      SELECT 1 FROM pilot_cancellation_operations c WHERE c.target_type = 'offer'
        AND c.target_id = NEW.id AND c.state IN ('recovered','acknowledged')
    ) THEN RETURN NEW; END IF;
    IF NEW.status = 'departed' AND EXISTS (
      SELECT 1 FROM ride_departures d WHERE d.ride_offer_id = NEW.id
        AND d.state IN ('recovered','acknowledged')
    ) THEN RETURN NEW; END IF;
    IF NEW.status = 'departed' AND EXISTS (
      SELECT 1 FROM pilot_departure_operations d WHERE d.offer_id = NEW.id
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
  END IF;
  PERFORM pilot_assert_activity('offers');
  RETURN NEW;
END; $$;
