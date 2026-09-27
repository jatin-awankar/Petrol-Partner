ALTER TABLE pilot_email_worker_state ADD COLUMN IF NOT EXISTS last_success_at timestamptz;

CREATE TABLE IF NOT EXISTS pilot_urgent_outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  participant_id uuid NOT NULL REFERENCES users(id),
  method text NOT NULL CHECK (method IN ('email', 'phone', 'in_person', 'other')),
  occurred_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN ('safety_check','pickup_exception','service_outage','delivery_failure','other_support')),
  outcome text NOT NULL CHECK (outcome IN ('contacted','no_answer','follow_up_required','resolved','escalated')),
  payload_digest text NOT NULL,
  state text NOT NULL DEFAULT 'committed' CHECK (state IN ('committed','acknowledged','recovered')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS pilot_urgent_outreach_participant_idx ON pilot_urgent_outreach(participant_id, recorded_at DESC);
