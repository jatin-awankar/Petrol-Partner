-- Unrestricted self-declarations; historical PRMITR approvals are untouched.
CREATE TABLE IF NOT EXISTS unrestricted_driver_declarations (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  policy_version text NOT NULL,
  licence_categories text[] NOT NULL,
  licence_expires_on date NOT NULL,
  declared_at timestamptz NOT NULL,
  renew_after timestamptz NOT NULL,
  revoked_at timestamptz,
  false_declaration_at timestamptz,
  operation_id uuid NOT NULL,
  CHECK (array_length(licence_categories,1) BETWEEN 1 AND 3),
  CHECK (licence_categories <@ ARRAY['bike','scooter','car']::text[]),
  CHECK (renew_after > declared_at)
);
CREATE TABLE IF NOT EXISTS unrestricted_vehicle_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL CHECK (category IN ('bike','scooter','car')),
  registration_identifier text NOT NULL,
  registration_expires_on date NOT NULL,
  insurance_expires_on date NOT NULL,
  permission_to_use boolean NOT NULL,
  belted_passenger_seats smallint,
  passenger_capacity smallint NOT NULL,
  policy_version text NOT NULL,
  declared_at timestamptz NOT NULL,
  renew_after timestamptz NOT NULL,
  revoked_at timestamptz,
  false_declaration_at timestamptz,
  operation_id uuid NOT NULL,
  CHECK (renew_after > declared_at),
  CHECK (permission_to_use OR revoked_at IS NOT NULL),
  CHECK ((category IN ('bike','scooter') AND belted_passenger_seats IS NULL AND passenger_capacity=1)
    OR (category='car' AND belted_passenger_seats BETWEEN 1 AND 8
      AND passenger_capacity BETWEEN 1 AND belted_passenger_seats)),
  UNIQUE(driver_user_id,registration_identifier)
);
CREATE TABLE IF NOT EXISTS unrestricted_declaration_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  payload_digest text NOT NULL,
  action text NOT NULL CHECK (action IN ('driver_declare','driver_revoke','vehicle_declare','vehicle_revoke')),
  subject_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('committed','acknowledged','recovered')),
  acknowledged_at timestamptz,
  UNIQUE(actor_user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS unrestricted_declaration_operations_state ON unrestricted_declaration_operations(state);
ALTER TABLE unrestricted_vehicle_declarations
  DROP CONSTRAINT IF EXISTS unrestricted_vehicle_declarations_permission_to_use_check;
ALTER TABLE unrestricted_vehicle_declarations
  DROP CONSTRAINT IF EXISTS unrestricted_vehicle_declarations_permission_or_revoked;
ALTER TABLE unrestricted_vehicle_declarations
  ADD CONSTRAINT unrestricted_vehicle_declarations_permission_or_revoked
    CHECK (permission_to_use OR revoked_at IS NOT NULL);
