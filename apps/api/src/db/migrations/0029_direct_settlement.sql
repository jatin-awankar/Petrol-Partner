CREATE TABLE IF NOT EXISTS pilot_settlement_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES pilot_contribution_obligations(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('claim','confirm','dispute')),
  method text CHECK (method IN ('cash','upi')),
  recorded_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz,
  UNIQUE(actor_id,idempotency_key),
  CHECK ((kind='claim' AND method IS NOT NULL) OR (kind<>'claim' AND method IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pilot_settlement_one_claim ON pilot_settlement_operations(obligation_id) WHERE kind='claim';
CREATE UNIQUE INDEX IF NOT EXISTS pilot_settlement_one_response ON pilot_settlement_operations(obligation_id) WHERE kind IN ('confirm','dispute');
CREATE TABLE IF NOT EXISTS pilot_settlement_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL UNIQUE REFERENCES pilot_contribution_obligations(id),
  reason text NOT NULL CHECK (reason IN ('disputed','driver_silence')),
  opened_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved'))
);
CREATE TABLE IF NOT EXISTS pilot_settlement_silence_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL UNIQUE REFERENCES pilot_contribution_obligations(id),
  recorded_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz
);
ALTER TABLE pilot_settlement_reviews ADD COLUMN IF NOT EXISTS silence_operation_id uuid
  REFERENCES pilot_settlement_silence_operations(id);
