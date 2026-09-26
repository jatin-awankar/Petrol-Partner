CREATE TABLE IF NOT EXISTS pilot_student_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id),
  student_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  reason text NOT NULL,
  previous_status text NOT NULL,
  effect_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  committed_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz,
  UNIQUE (operator_id,idempotency_key)
);
ALTER TABLE pilot_student_revocations ADD COLUMN IF NOT EXISTS effect_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE driver_car_review_operations ADD COLUMN IF NOT EXISTS effect_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS pilot_revocation_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_operation_id uuid NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('student','driver','vehicle','association')),
  subject_id uuid NOT NULL,
  offer_id uuid NOT NULL REFERENCES ride_offers(id),
  allocation_id uuid REFERENCES pilot_seat_allocations(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution text CHECK (resolution IN ('cancelled','eligibility_restored')),
  resolution_reason text,
  UNIQUE (source_operation_id,offer_id,allocation_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pilot_revocation_ride_hold_once
  ON pilot_revocation_holds(source_operation_id,offer_id) WHERE allocation_id IS NULL;
CREATE INDEX IF NOT EXISTS pilot_revocation_holds_open ON pilot_revocation_holds(offer_id) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS pilot_revocation_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_operation_id uuid NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('student','driver','vehicle','association')),
  subject_id uuid NOT NULL,
  offer_id uuid NOT NULL REFERENCES ride_offers(id),
  priority text NOT NULL DEFAULT 'high' CHECK (priority='high'),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution text CHECK (resolution IN ('safe_completion','interrupted')),
  resolution_reason text,
  UNIQUE (source_operation_id,offer_id)
);
CREATE INDEX IF NOT EXISTS pilot_revocation_incidents_open ON pilot_revocation_incidents(created_at)
  WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS pilot_revocation_case_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  case_type text NOT NULL CHECK (case_type IN ('hold','incident')),
  case_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('outreach','resolve')),
  outcome text,
  reason text NOT NULL,
  recipient_ids uuid[] NOT NULL DEFAULT '{}',
  committed_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz,
  UNIQUE (operator_id,idempotency_key)
);

CREATE OR REPLACE FUNCTION pilot_guard_offer_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF (SELECT mode FROM pilot_recovery_state WHERE singleton=true)='restricted' THEN
    IF TG_OP='INSERT' AND EXISTS (SELECT 1 FROM pilot_offer_operations o
      WHERE o.offer_id=NEW.id AND o.state='recovered' AND o.action='published'
        AND (o.offer_snapshot=to_jsonb(NEW)
          OR o.offer_snapshot=to_jsonb(NEW)-'pilot_replaces_offer_id'))
      THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND EXISTS (SELECT 1 FROM pilot_offer_operations o
      WHERE o.offer_id=NEW.id AND o.state='recovered' AND o.action='updated'
        AND (o.offer_snapshot=to_jsonb(NEW)
          OR o.offer_snapshot=to_jsonb(NEW)-'pilot_replaces_offer_id'))
      THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('active','held') THEN
      IF NEW.status='cancelled' AND EXISTS (SELECT 1 FROM pilot_cancellation_operations c
        WHERE c.target_type='offer' AND c.target_id=NEW.id
          AND c.state IN ('recovered','acknowledged')) THEN RETURN NEW; END IF;
      IF NEW.status='departed' AND EXISTS (SELECT 1 FROM ride_departures d
        WHERE d.ride_offer_id=NEW.id AND d.state IN ('recovered','acknowledged'))
        THEN RETURN NEW; END IF;
      IF NEW.status='departed' AND EXISTS (SELECT 1 FROM pilot_departure_operations d
        WHERE d.offer_id=NEW.id AND d.state IN ('recovered','acknowledged'))
        THEN RETURN NEW; END IF;
      IF NEW.status='held' AND EXISTS (SELECT 1 FROM driver_car_review_operations o
        WHERE o.outcome='revoked' AND o.state IN ('recovered','acknowledged')
          AND ((o.subject_type='driver' AND o.subject_id=NEW.driver_id
            AND EXISTS (SELECT 1 FROM driver_eligibility d
              WHERE d.user_id=NEW.driver_id AND d.status='suspended'))
          OR (o.subject_type='vehicle' AND o.subject_id=NEW.vehicle_id
            AND EXISTS (SELECT 1 FROM vehicles v
              WHERE v.id=NEW.vehicle_id AND v.verification_status='rejected'))
          OR (o.subject_type='association' AND EXISTS
            (SELECT 1 FROM driver_vehicle_approvals a WHERE a.id=o.subject_id
              AND a.driver_user_id=NEW.driver_id AND a.vehicle_id=NEW.vehicle_id
              AND a.status='revoked')))) THEN RETURN NEW; END IF;
      IF NEW.status='held' AND EXISTS (SELECT 1 FROM pilot_revocation_holds h
        WHERE h.offer_id=NEW.id AND h.allocation_id IS NULL) THEN RETURN NEW; END IF;
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='active' AND NEW.status='held'
    AND EXISTS (SELECT 1 FROM pilot_revocation_holds h
      WHERE h.offer_id=NEW.id AND h.allocation_id IS NULL AND h.resolved_at IS NULL
        AND (EXISTS (SELECT 1 FROM pilot_student_revocations s
          WHERE s.id=h.source_operation_id AND s.state IN ('committed','acknowledged','recovered'))
          OR EXISTS (SELECT 1 FROM driver_car_review_operations d
            WHERE d.id=h.source_operation_id AND d.outcome='revoked'
              AND d.state IN ('committed','acknowledged','recovered'))))
    THEN RETURN NEW; END IF;
  PERFORM pilot_assert_activity('offers');
  RETURN NEW;
END; $$;
