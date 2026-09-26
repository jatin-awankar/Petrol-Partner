-- Provisional synthetic corridor policy. An operator must replace and approve it before real trips.
CREATE TABLE IF NOT EXISTS pilot_corridor_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  timezone text NOT NULL DEFAULT 'Asia/Kolkata' CHECK (timezone = 'Asia/Kolkata'),
  expected_minutes integer NOT NULL CHECK (expected_minutes BETWEEN 1 AND 480),
  buffer_minutes integer NOT NULL CHECK (buffer_minutes BETWEEN 1 AND 480),
  schedule_start time NOT NULL,
  schedule_end time NOT NULL,
  weekdays integer[] NOT NULL,
  cancellation_notice text NOT NULL,
  contact_notice text NOT NULL,
  approved_for_real_trips boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS pilot_corridor_one_active ON pilot_corridor_policies(active) WHERE active;
CREATE TABLE IF NOT EXISTS pilot_corridor_stops (
  policy_id uuid NOT NULL REFERENCES pilot_corridor_policies(id),
  code text NOT NULL,
  label text NOT NULL,
  sequence integer NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  PRIMARY KEY(policy_id, code),
  UNIQUE(policy_id, sequence)
);
CREATE TABLE IF NOT EXISTS pilot_corridor_contributions (
  policy_id uuid NOT NULL REFERENCES pilot_corridor_policies(id),
  origin_code text NOT NULL,
  destination_code text NOT NULL,
  amount_paise integer NOT NULL CHECK(amount_paise > 0),
  PRIMARY KEY(policy_id, origin_code, destination_code),
  FOREIGN KEY(policy_id, origin_code) REFERENCES pilot_corridor_stops(policy_id, code),
  FOREIGN KEY(policy_id, destination_code) REFERENCES pilot_corridor_stops(policy_id, code)
);
INSERT INTO pilot_corridor_policies(version, expected_minutes, buffer_minutes, schedule_start, schedule_end, weekdays,
 cancellation_notice, contact_notice)
SELECT 1, 35, 20, '08:00', '18:00', ARRAY[1,2,3,4,5,6],
 'Cancellation terms are provisional; contact the operator for a supervised cancellation.',
 'Participant phone numbers are never shared. Use trip details and operator support for coordination.'
WHERE NOT EXISTS (SELECT 1 FROM pilot_corridor_policies)
ON CONFLICT (version) DO NOTHING;
INSERT INTO pilot_corridor_stops(policy_id,code,label,sequence,latitude,longitude)
SELECT id, code, label, seq, lat, lng FROM pilot_corridor_policies CROSS JOIN (VALUES
 ('university','Amravati University',1,20.9386,77.7600),
 ('prmitr','PRMITR',2,20.9300,77.7500)) AS s(code,label,seq,lat,lng)
WHERE version=1
ON CONFLICT (policy_id,code) DO NOTHING;
INSERT INTO pilot_corridor_contributions(policy_id,origin_code,destination_code,amount_paise)
SELECT id,'university','prmitr',2500 FROM pilot_corridor_policies WHERE version=1
UNION ALL SELECT id,'prmitr','university',2500 FROM pilot_corridor_policies WHERE version=1
ON CONFLICT (policy_id,origin_code,destination_code) DO NOTHING;
ALTER TABLE ride_offers ADD COLUMN IF NOT EXISTS pilot_policy_id uuid REFERENCES pilot_corridor_policies(id),
 ADD COLUMN IF NOT EXISTS pilot_policy_snapshot jsonb,
 ADD COLUMN IF NOT EXISTS pilot_origin_code text,
 ADD COLUMN IF NOT EXISTS pilot_destination_code text,
 ADD COLUMN IF NOT EXISTS pilot_capacity integer CHECK(pilot_capacity > 0),
 ADD COLUMN IF NOT EXISTS pilot_currency text CHECK(pilot_currency = 'INR'),
 ADD COLUMN IF NOT EXISTS pilot_request_cutoff_at timestamptz,
 ADD COLUMN IF NOT EXISTS pilot_acceptance_cutoff_at timestamptz,
 ADD COLUMN IF NOT EXISTS pilot_commitment_until timestamptz,
 ADD COLUMN IF NOT EXISTS pilot_version integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS pilot_offer_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES users(id),
 idempotency_key text NOT NULL,
 payload_digest text NOT NULL,
 offer_id uuid NOT NULL REFERENCES ride_offers(id) DEFERRABLE INITIALLY DEFERRED,
 action text NOT NULL CHECK(action IN ('published','updated')),
 result jsonb NOT NULL,
 offer_snapshot jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('committed','acknowledged','recovered')),
 created_at timestamptz NOT NULL DEFAULT now(),
 acknowledged_at timestamptz,
 UNIQUE(actor_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS pilot_offer_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_id uuid NOT NULL UNIQUE REFERENCES pilot_offer_operations(id),
 offer_id uuid NOT NULL REFERENCES ride_offers(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pilot_offers_discovery ON ride_offers(date,time) WHERE pilot_policy_id IS NOT NULL AND status='active';
