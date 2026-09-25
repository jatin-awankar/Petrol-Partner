ALTER TABLE student_evidence ADD COLUMN IF NOT EXISTS deletion_outcome text
  CHECK (deletion_outcome IN ('deleted', 'already_missing', 'failed'));
