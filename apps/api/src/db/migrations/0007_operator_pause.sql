CREATE TABLE IF NOT EXISTS pilot_pause_state (
  capability text PRIMARY KEY CHECK (capability IN ('offers', 'requests', 'acceptance', 'booking')),
  paused boolean NOT NULL DEFAULT true,
  operation_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO pilot_pause_state (capability, paused) VALUES
  ('offers', true), ('requests', true), ('acceptance', true), ('booking', true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS pilot_pause_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  capability text NOT NULL CHECK (capability IN ('offers', 'requests', 'acceptance', 'booking')),
  paused boolean NOT NULL,
  reason text NOT NULL,
  state text NOT NULL CHECK (state IN ('intent', 'committed', 'acknowledged', 'recovered')),
  committed_at timestamptz,
  acknowledged_at timestamptz,
  UNIQUE (operator_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS pilot_pause_audit (
  operation_id uuid PRIMARY KEY REFERENCES pilot_pause_operations(id),
  operator_id uuid NOT NULL REFERENCES users(id),
  capability text NOT NULL,
  paused boolean NOT NULL,
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS pilot_pause_followup (
  operation_id uuid PRIMARY KEY REFERENCES pilot_pause_operations(id),
  kind text NOT NULL CHECK (kind = 'operator_pause_changed'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pilot_recovery_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mode text NOT NULL CHECK (mode IN ('open', 'restricted')),
  cause text,
  started_at timestamptz,
  reconciled_at timestamptz,
  reopened_at timestamptz,
  reopened_by uuid REFERENCES users(id)
);
INSERT INTO pilot_recovery_state (singleton, mode, cause, started_at) VALUES (true, 'restricted', 'awaiting_reconciliation', now()) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS pilot_recovery_events (
  id bigserial PRIMARY KEY,
  event text NOT NULL CHECK (event IN ('restricted', 'reconciled', 'reopened')),
  operator_id uuid REFERENCES users(id),
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Every protected write shares the recovery-state lock with operator decisions.
-- This closes the gap between an HTTP guard and the domain transaction.
CREATE OR REPLACE FUNCTION pilot_assert_activity(capability_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_mode text; booking_paused boolean; target_paused boolean;
BEGIN
  SELECT mode INTO current_mode FROM pilot_recovery_state WHERE singleton = true FOR SHARE;
  SELECT paused INTO booking_paused FROM pilot_pause_state WHERE capability = 'booking' FOR SHARE;
  SELECT paused INTO target_paused FROM pilot_pause_state WHERE capability = capability_name FOR SHARE;
  IF current_mode IS DISTINCT FROM 'open' OR booking_paused IS DISTINCT FROM false OR target_paused IS DISTINCT FROM false
    OR EXISTS (SELECT 1 FROM pilot_pause_operations WHERE state IN ('intent', 'committed')) THEN
    RAISE EXCEPTION 'Pilot activity is paused' USING ERRCODE = 'P0001';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION pilot_guard_offer_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN PERFORM pilot_assert_activity('offers'); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION pilot_guard_request_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN PERFORM pilot_assert_activity('requests'); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION pilot_guard_booking_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pilot_assert_activity('booking');
  IF TG_OP = 'INSERT' THEN
    PERFORM pilot_assert_activity('acceptance');
  ELSIF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    PERFORM pilot_assert_activity('acceptance');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS pilot_guard_offer_insert ON ride_offers;
CREATE TRIGGER pilot_guard_offer_insert BEFORE INSERT OR UPDATE ON ride_offers FOR EACH ROW EXECUTE FUNCTION pilot_guard_offer_insert();
DROP TRIGGER IF EXISTS pilot_guard_request_insert ON ride_requests;
CREATE TRIGGER pilot_guard_request_insert BEFORE INSERT OR UPDATE ON ride_requests FOR EACH ROW EXECUTE FUNCTION pilot_guard_request_insert();
DROP TRIGGER IF EXISTS pilot_guard_booking_mutation ON bookings;
CREATE TRIGGER pilot_guard_booking_mutation BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION pilot_guard_booking_mutation();

CREATE TABLE IF NOT EXISTS pilot_reopen_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  reason text NOT NULL,
  reconciliation_digest text NOT NULL,
  state text NOT NULL CHECK (state IN ('committed', 'acknowledged', 'recovered')),
  committed_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE (operator_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS pilot_reopen_audit (
  operation_id uuid PRIMARY KEY REFERENCES pilot_reopen_operations(id),
  operator_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL
);

-- Supports repeated disposable rehearsals of this not-yet-deployed migration.
-- Existing rows without a digest remain restricted until investigated.
ALTER TABLE pilot_reopen_operations ADD COLUMN IF NOT EXISTS reconciliation_digest text;
