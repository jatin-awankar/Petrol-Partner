ALTER TABLE pilot_seat_requests DROP CONSTRAINT pilot_seat_requests_status_check;
ALTER TABLE pilot_seat_requests ADD CONSTRAINT pilot_seat_requests_status_check
  CHECK (status IN ('pending','rejected','expired','accepted','withdrawn','cancelled'));

ALTER TABLE ride_offers ADD COLUMN IF NOT EXISTS pilot_replaces_offer_id uuid UNIQUE REFERENCES ride_offers(id);

CREATE TABLE IF NOT EXISTS pilot_cancellation_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('request','offer')),
  target_id uuid NOT NULL,
  reason text,
  result jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE(actor_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS pilot_cancellation_audit (
  operation_id uuid NOT NULL REFERENCES pilot_cancellation_operations(id),
  request_id uuid NOT NULL REFERENCES pilot_seat_requests(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  cancelled_at timestamptz NOT NULL,
  reason text,
  PRIMARY KEY(operation_id,request_id)
);
CREATE INDEX IF NOT EXISTS pilot_cancellation_audit_request ON pilot_cancellation_audit(request_id);

-- A receipt-backed cancellation may be restored while protected writes are fenced.
CREATE OR REPLACE FUNCTION pilot_guard_offer_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'active'
    AND (SELECT mode FROM pilot_recovery_state WHERE singleton = true) = 'restricted' THEN
    IF NEW.status = 'cancelled' AND EXISTS (
      SELECT 1 FROM pilot_cancellation_operations c WHERE c.target_type = 'offer'
        AND c.target_id = NEW.id AND c.state IN ('recovered','acknowledged')
    ) THEN RETURN NEW; END IF;
    IF NEW.status = 'departed' AND EXISTS (
      SELECT 1 FROM ride_departures d WHERE d.ride_offer_id = NEW.id
        AND d.state IN ('recovered','acknowledged')
    ) THEN RETURN NEW; END IF;
    IF NEW.status = 'held' AND EXISTS (
      SELECT 1 FROM driver_car_review_operations o
      WHERE o.outcome = 'revoked' AND o.state IN ('recovered','acknowledged')
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
