ALTER TABLE student_verifications
  ADD COLUMN IF NOT EXISTS age_evidence_category text CHECK (age_evidence_category IN
    ('redacted_government_id', 'redacted_birth_certificate', 'institution_age_record', 'other_age_record')),
  ADD COLUMN IF NOT EXISTS review_cycle integer NOT NULL DEFAULT 1 CHECK (review_cycle > 0);

ALTER TABLE student_evidence
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'enrollment'
    CHECK (purpose IN ('enrollment', 'age')),
  ADD COLUMN IF NOT EXISTS review_cycle integer NOT NULL DEFAULT 1 CHECK (review_cycle > 0);

ALTER TABLE student_evidence DROP CONSTRAINT IF EXISTS student_evidence_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS student_evidence_cycle_purpose_unique
  ON student_evidence (user_id, review_cycle, purpose);
CREATE INDEX IF NOT EXISTS student_evidence_user_cycle_idx
  ON student_evidence (user_id, review_cycle);
