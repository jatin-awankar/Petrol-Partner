ALTER TABLE student_verifications
  ADD COLUMN IF NOT EXISTS enrolled_name text,
  ADD COLUMN IF NOT EXISTS evidence_category text CHECK (evidence_category IN
    ('enrollment_letter', 'student_card', 'college_email', 'other_enrollment')),
  ADD COLUMN IF NOT EXISTS adult_eligible boolean;

-- Legacy rows remain intact. Policy queries require adult_eligible = true.

CREATE TABLE IF NOT EXISTS student_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  object_key uuid NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  byte_count integer NOT NULL CHECK (byte_count BETWEEN 1 AND 524288),
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'retained', 'deleted')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  decision_at timestamptz,
  delete_after timestamptz,
  deleted_at timestamptz,
  delete_attempts integer NOT NULL DEFAULT 0,
  last_delete_error text,
  hold_reason text,
  hold_until timestamptz,
  CHECK ((status = 'pending_review') = (decision_at IS NULL))
);
CREATE INDEX IF NOT EXISTS student_evidence_due_idx ON student_evidence (delete_after)
  WHERE status = 'retained';
