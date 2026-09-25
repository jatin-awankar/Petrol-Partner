CREATE TABLE IF NOT EXISTS pilot_backup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  snapshot_at timestamptz,
  uploaded_at timestamptz,
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  object_key text,
  ciphertext_sha256 text,
  error_code text,
  CHECK (status <> 'complete' OR
    (snapshot_at IS NOT NULL AND uploaded_at IS NOT NULL AND finished_at IS NOT NULL
     AND object_key IS NOT NULL AND ciphertext_sha256 ~ '^[0-9a-f]{64}$'))
);
CREATE INDEX IF NOT EXISTS pilot_backup_attempts_recent ON pilot_backup_attempts (started_at DESC);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pilot_api_runtime') THEN
    GRANT SELECT ON pilot_backup_attempts TO pilot_api_runtime;
  END IF;
END $$;
