ALTER TABLE pilot_offer_operations ADD COLUMN IF NOT EXISTS offer_snapshot jsonb;
ALTER TABLE pilot_offer_operations ALTER CONSTRAINT pilot_offer_operations_offer_id_fkey DEFERRABLE INITIALLY DEFERRED;

-- A recovered operation must be present before replaying an offer while the pilot
-- is restricted. Ordinary inserts and updates continue through the pause guard.
CREATE OR REPLACE FUNCTION pilot_guard_offer_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (SELECT mode FROM pilot_recovery_state WHERE singleton = true) = 'restricted' THEN
    IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM pilot_offer_operations o
      WHERE o.offer_id = NEW.id AND o.state = 'recovered' AND o.action = 'published'
        AND o.offer_snapshot = to_jsonb(NEW))
    THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM pilot_offer_operations o
      WHERE o.offer_id = NEW.id AND o.state = 'recovered' AND o.action = 'updated'
        AND o.offer_snapshot = to_jsonb(NEW))
    THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
      IF NEW.status = 'departed' AND EXISTS (SELECT 1 FROM ride_departures d
        WHERE d.ride_offer_id = NEW.id AND d.state IN ('recovered', 'acknowledged'))
      THEN RETURN NEW; END IF;
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
