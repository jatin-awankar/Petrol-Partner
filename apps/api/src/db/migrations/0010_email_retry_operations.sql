CREATE TABLE IF NOT EXISTS pilot_email_retry_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  job_id uuid NOT NULL REFERENCES pilot_email_jobs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, idempotency_key)
);
