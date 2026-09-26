-- Legacy approvals remain recorded, but cannot pass the new pilot eligibility check
-- until their vehicle classification, dates and driver association are reviewed.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS use_category text CHECK (use_category IN ('private', 'taxi', 'rental', 'commercial')),
  ADD COLUMN IF NOT EXISTS registration_expires_at date,
  ADD COLUMN IF NOT EXISTS insurance_expires_at date,
  ADD COLUMN IF NOT EXISTS applicable_document_required boolean,
  ADD COLUMN IF NOT EXISTS review_after date;

ALTER TABLE driver_eligibility ADD COLUMN IF NOT EXISTS review_after date;

CREATE TABLE IF NOT EXISTS driver_vehicle_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id uuid NOT NULL REFERENCES users(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  permission_category text NOT NULL CHECK (permission_category IN ('owner', 'written_permission')),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'revoked')),
  review_after date,
  reason text,
  reviewed_by_user_id uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_user_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS driver_car_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_user_id uuid NOT NULL REFERENCES users(id),
  subject_type text NOT NULL CHECK (subject_type IN ('driver', 'vehicle', 'association')),
  subject_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('licence', 'registration', 'insurance', 'applicable', 'permission')),
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
  deletion_outcome text CHECK (deletion_outcome IN ('deleted', 'already_missing', 'failed')),
  next_delete_attempt_at timestamptz,
  hold_reason text,
  hold_until timestamptz,
  UNIQUE (subject_type, subject_id, purpose)
);
CREATE INDEX IF NOT EXISTS driver_car_evidence_due_idx ON driver_car_evidence (delete_after)
  WHERE status = 'retained';

-- Replaced documents remain independently scheduled for deletion so a new
-- submission cannot orphan the prior private object.
CREATE TABLE IF NOT EXISTS driver_car_evidence_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'retained' CHECK (status IN ('retained', 'deleted')),
  delete_after timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  delete_attempts integer NOT NULL DEFAULT 0,
  last_delete_error text,
  deletion_outcome text CHECK (deletion_outcome IN ('deleted', 'already_missing', 'failed')),
  next_delete_attempt_at timestamptz,
  hold_until timestamptz
);
ALTER TABLE driver_car_evidence ADD COLUMN IF NOT EXISTS deletion_outcome text
  CHECK (deletion_outcome IN ('deleted', 'already_missing', 'failed'));

CREATE TABLE IF NOT EXISTS driver_car_evidence_access_grants (
  token_hash text PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES users(id),
  evidence_id uuid NOT NULL REFERENCES driver_car_evidence(id),
  access_purpose text NOT NULL DEFAULT 'eligibility_review' CHECK (access_purpose = 'eligibility_review'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
ALTER TABLE driver_car_evidence_access_grants
  ADD COLUMN IF NOT EXISTS access_purpose text NOT NULL DEFAULT 'eligibility_review'
    CHECK (access_purpose = 'eligibility_review');

CREATE TABLE IF NOT EXISTS driver_car_review_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('driver', 'vehicle', 'association')),
  subject_id uuid NOT NULL,
  applicant_user_id uuid NOT NULL REFERENCES users(id),
  outcome text NOT NULL CHECK (outcome IN ('approved', 'rejected', 'revoked')),
  reason text NOT NULL,
  review_after date,
  decision_snapshot jsonb NOT NULL,
  evidence_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  state text NOT NULL CHECK (state IN ('committed', 'acknowledged', 'recovered')),
  committed_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE (operator_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS driver_car_review_pending_idx ON driver_car_review_operations (state)
  WHERE state = 'committed';
ALTER TABLE driver_car_review_operations ADD COLUMN IF NOT EXISTS evidence_snapshot jsonb
  NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS driver_car_expiry_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('driver', 'vehicle', 'association')),
  subject_id uuid NOT NULL,
  recipient_id uuid NOT NULL REFERENCES users(id),
  expiry_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, expiry_date)
);
