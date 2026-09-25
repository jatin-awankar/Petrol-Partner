-- A notification event is committed with its originating protected mutation.
-- Delivery is gated by the operation's independently evidenced state.
CREATE TABLE IF NOT EXISTS pilot_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_type text NOT NULL,
  operation_id uuid NOT NULL,
  recipient_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL,
  related_entity_type text NOT NULL,
  related_entity_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  ready_at timestamptz,
  UNIQUE (origin_type, operation_id, recipient_id, event_type),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Upgrade disposable rehearsal schemas created before the generic contract.
ALTER TABLE pilot_notification_events DROP CONSTRAINT IF EXISTS pilot_notification_events_operation_id_fkey;
ALTER TABLE pilot_notification_events DROP CONSTRAINT IF EXISTS pilot_notification_events_operation_id_key;
ALTER TABLE pilot_notification_events DROP CONSTRAINT IF EXISTS pilot_notification_events_event_type_check;
ALTER TABLE pilot_notification_events ADD COLUMN IF NOT EXISTS origin_type text;
ALTER TABLE pilot_notification_events ADD COLUMN IF NOT EXISTS related_entity_type text;
ALTER TABLE pilot_notification_events ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE pilot_notification_events ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE pilot_notification_events ADD COLUMN IF NOT EXISTS ready_at timestamptz;
UPDATE pilot_notification_events e SET origin_type = 'operator_pause', related_entity_type = 'pilot_pause_operation',
  title = 'Pilot operator decision', body = 'An operator changed pilot availability.',
  ready_at = CASE WHEN o.state IN ('acknowledged', 'recovered') THEN o.acknowledged_at ELSE NULL END
  FROM pilot_pause_operations o WHERE o.id = e.operation_id AND e.origin_type IS NULL;
ALTER TABLE pilot_notification_events ALTER COLUMN origin_type SET NOT NULL;
ALTER TABLE pilot_notification_events ALTER COLUMN related_entity_type SET NOT NULL;
ALTER TABLE pilot_notification_events ALTER COLUMN title SET NOT NULL;
ALTER TABLE pilot_notification_events ALTER COLUMN body SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pilot_notification_events_identity_idx
  ON pilot_notification_events (origin_type, operation_id, recipient_id, event_type);
CREATE TABLE IF NOT EXISTS pilot_email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES pilot_notification_events(id),
  recipient_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'leased', 'sent', 'exhausted')),
  due_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  lease_until timestamptz,
  last_error text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'leased') = (lease_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS pilot_email_jobs_due_idx ON pilot_email_jobs (due_at) WHERE status IN ('pending', 'leased');
CREATE TABLE IF NOT EXISTS pilot_email_worker_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_seen_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS pilot_email_attempts (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES pilot_email_jobs(id),
  attempt integer NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  outcome text CHECK (outcome IN ('sent', 'failed'))
);
-- Allows repeated disposable rehearsals after the attempt history shape changed.
ALTER TABLE pilot_email_attempts ADD COLUMN IF NOT EXISTS id bigserial;
ALTER TABLE pilot_email_attempts DROP CONSTRAINT IF EXISTS pilot_email_attempts_pkey;
ALTER TABLE pilot_email_attempts ADD PRIMARY KEY (id);
