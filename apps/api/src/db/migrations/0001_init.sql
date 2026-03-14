CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text,
  google_id text UNIQUE,
  role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  college text,
  avatar_url text,
  is_verified boolean NOT NULL DEFAULT false,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  user_agent text,
  ip text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_text text NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  drop_text text NOT NULL,
  drop_lat double precision NOT NULL,
  drop_lng double precision NOT NULL,
  departure_at timestamptz NOT NULL,
  available_seats integer NOT NULL CHECK (available_seats >= 0),
  price_per_seat_paise integer NOT NULL CHECK (price_per_seat_paise >= 0),
  status text NOT NULL DEFAULT 'active',
  vehicle_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_offer_id uuid NOT NULL REFERENCES ride_offers(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seats_booked integer NOT NULL CHECK (seats_booked > 0),
  total_amount_paise integer NOT NULL CHECK (total_amount_paise >= 0),
  status text NOT NULL,
  payment_state text NOT NULL,
  expires_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booking_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_order_id text NOT NULL UNIQUE,
  amount_paise integer NOT NULL CHECK (amount_paise >= 0),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL,
  idempotency_key text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id uuid NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  provider_payment_id text UNIQUE,
  provider_signature text,
  status text NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  raw_body text NOT NULL,
  signature text,
  processing_status text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  key text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_scope_key
  ON idempotency_keys(scope, key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_webhook_events_provider_payload_hash
  ON payment_webhook_events(provider, payload_hash);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_ride_offers_driver_status_departure
  ON ride_offers(driver_id, status, departure_at);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger_status ON bookings(passenger_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_driver_status ON bookings(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_ride_offer_status ON bookings(ride_offer_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_order_id
  ON payment_orders(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_provider_payment_id
  ON payment_attempts(provider_payment_id);
