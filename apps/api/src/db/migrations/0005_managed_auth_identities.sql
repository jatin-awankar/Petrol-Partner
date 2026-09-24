ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS auth_identities (
  provider text NOT NULL,
  provider_subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider_email text NOT NULL,
  first_linked_at timestamptz NOT NULL DEFAULT now(),
  last_validated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  PRIMARY KEY (provider, provider_subject)
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_one_active_provider_per_user
  ON auth_identities(provider, user_id)
  WHERE disabled_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_identity_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('registered', 'claimed', 'validated', 'disabled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_identity_events_user_created_at
  ON auth_identity_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_claim_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_subject text NOT NULL,
  provider_email text,
  reason text NOT NULL CHECK (reason IN ('missing_email', 'email_not_verified', 'email_collision', 'identity_conflict')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (provider, provider_subject, status)
);

CREATE TABLE IF NOT EXISTS auth_cutover_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  active_provider text NOT NULL DEFAULT 'legacy',
  legacy_login_enabled boolean NOT NULL DEFAULT true,
  authorized_at timestamptz,
  authorized_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO auth_cutover_state (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;
