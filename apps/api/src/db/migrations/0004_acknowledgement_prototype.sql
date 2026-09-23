CREATE TABLE IF NOT EXISTS acknowledgement_system_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mode text NOT NULL CHECK (mode IN ('open', 'restricted')),
  reason text,
  restricted_since timestamptz,
  reconciled_at timestamptz,
  reopened_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO acknowledgement_system_state (singleton, mode)
VALUES (true, 'open')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS acknowledgement_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('intent', 'db_committed', 'acknowledged', 'recovered')),
  result jsonb,
  intent_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  receipt_recorded_at timestamptz,
  acknowledged_at timestamptz,
  UNIQUE (scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS synthetic_actions (
  operation_id uuid PRIMARY KEY REFERENCES acknowledgement_operations(id),
  subject text NOT NULL,
  delta integer NOT NULL,
  resulting_value integer NOT NULL,
  external_effect_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acknowledgement_audit (
  id bigserial PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES acknowledgement_operations(id),
  event text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, event)
);

CREATE TABLE IF NOT EXISTS acknowledgement_notifications (
  operation_id uuid PRIMARY KEY REFERENCES acknowledgement_operations(id),
  status text NOT NULL CHECK (status IN ('ready')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acknowledgement_system_events (
  id bigserial PRIMARY KEY,
  event text NOT NULL CHECK (event IN ('restricted', 'reopened')),
  operator_id text,
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE acknowledgement_system_state
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
