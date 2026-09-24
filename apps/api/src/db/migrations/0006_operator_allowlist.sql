CREATE TABLE IF NOT EXISTS operator_allowlist (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operator_allowlist_active_idx
  ON operator_allowlist(user_id) WHERE active = true;
