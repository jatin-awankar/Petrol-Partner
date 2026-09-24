ALTER TABLE pilot_pause_operations
  ADD COLUMN IF NOT EXISTS resumed_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS resume_reason text,
  ADD COLUMN IF NOT EXISTS resumed_from text CHECK (resumed_from IN ('intent', 'committed'));
ALTER TABLE pilot_pause_audit ADD COLUMN IF NOT EXISTS executed_by uuid REFERENCES users(id);
UPDATE pilot_pause_audit SET executed_by = operator_id WHERE executed_by IS NULL;
ALTER TABLE pilot_pause_audit ALTER COLUMN executed_by SET NOT NULL;
ALTER TABLE pilot_recovery_events ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES pilot_pause_operations(id);
ALTER TABLE pilot_recovery_events DROP CONSTRAINT IF EXISTS pilot_recovery_events_event_check;
ALTER TABLE pilot_recovery_events ADD CONSTRAINT pilot_recovery_events_event_check
  CHECK (event IN ('restricted', 'reconciled', 'reopened', 'decision_resumed'));
CREATE UNIQUE INDEX IF NOT EXISTS pilot_recovery_events_decision_resumed_unique
  ON pilot_recovery_events (operation_id) WHERE event = 'decision_resumed';
