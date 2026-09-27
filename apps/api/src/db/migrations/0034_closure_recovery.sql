-- Keep 0033 immutable. Existing closure events, if any, remain committed until
-- independent evidence is inventoried and reconciled before writes reopen.
ALTER TABLE pilot_closure_events ADD COLUMN IF NOT EXISTS subject_id uuid;
ALTER TABLE pilot_closure_events ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pilot_closure_events ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'committed'
  CHECK (state IN ('committed','acknowledged','recovered'));
CREATE UNIQUE INDEX IF NOT EXISTS pilot_closure_event_subject_once
  ON pilot_closure_events(event,subject_id) WHERE subject_id IS NOT NULL;
