ALTER TABLE student_evidence ADD COLUMN IF NOT EXISTS next_delete_attempt_at timestamptz;
CREATE INDEX IF NOT EXISTS student_evidence_retry_idx ON student_evidence
  (next_delete_attempt_at) WHERE status = 'retained';
