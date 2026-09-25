-- A notification event is committed with its originating protected mutation.
-- Delivery is gated by the operation's independently evidenced state.
CREATE TABLE IF NOT EXISTS pilot_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE REFERENCES pilot_pause_operations(id),
  recipient_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type = 'operator_pause_changed'),
  related_entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
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
