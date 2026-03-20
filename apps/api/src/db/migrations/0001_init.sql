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
  gender_for_matching text CHECK (gender_for_matching IN ('female', 'male')),
  is_verified boolean NOT NULL DEFAULT false,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('digilocker', 'abc_id', 'manual_review')),
  status text NOT NULL CHECK (status IN ('pending_consent', 'pending_review', 'verified', 'revalidation_due', 'expired', 'suspended', 'rejected')),
  student_identifier_last4 text,
  institution_name text NOT NULL,
  program_name text,
  admission_year integer CHECK (admission_year BETWEEN 2000 AND 2100),
  graduation_year integer CHECK (graduation_year BETWEEN 2000 AND 2100),
  verified_at timestamptz,
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  eligibility_starts_at timestamptz,
  eligibility_ends_at timestamptz NOT NULL,
  revalidate_after timestamptz,
  consent_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_eligibility (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('not_started', 'pending_review', 'approved', 'expiring', 'expired', 'suspended', 'rejected')),
  license_number_last4 text,
  license_expires_at date,
  insurance_expires_at date,
  puc_expires_at date,
  last_verified_at timestamptz,
  approved_at timestamptz,
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('bike', 'car', 'suv', 'scooter', 'van', 'other')),
  make text,
  model text,
  color text,
  registration_number_last4 text NOT NULL,
  seat_capacity integer NOT NULL CHECK (seat_capacity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  verification_status text NOT NULL DEFAULT 'pending_review' CHECK (verification_status IN ('pending_review', 'approved', 'rejected')),
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  area_type text NOT NULL CHECK (area_type IN ('metro', 'urban', 'rural')),
  vehicle_type text CHECK (vehicle_type IN ('bike', 'car', 'suv', 'scooter', 'van', 'other')),
  base_fare_paise integer NOT NULL DEFAULT 0 CHECK (base_fare_paise >= 0),
  per_km_paise integer NOT NULL CHECK (per_km_paise >= 0),
  minimum_fare_paise integer NOT NULL CHECK (minimum_fare_paise >= 0),
  platform_fee_fixed_paise integer NOT NULL DEFAULT 0 CHECK (platform_fee_fixed_paise >= 0),
  platform_fee_bps integer NOT NULL DEFAULT 0 CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fare_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id uuid NOT NULL REFERENCES pricing_rate_cards(id) ON DELETE RESTRICT,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  area_type text NOT NULL CHECK (area_type IN ('metro', 'urban', 'rural')),
  distance_km numeric(8,2) NOT NULL CHECK (distance_km > 0),
  seats integer NOT NULL CHECK (seats > 0),
  ride_fare_per_seat_paise integer NOT NULL CHECK (ride_fare_per_seat_paise >= 0),
  platform_fee_per_seat_paise integer NOT NULL CHECK (platform_fee_per_seat_paise >= 0),
  total_per_seat_paise integer NOT NULL CHECK (total_per_seat_paise >= 0),
  total_ride_fare_paise integer NOT NULL CHECK (total_ride_fare_paise >= 0),
  total_platform_fee_paise integer NOT NULL CHECK (total_platform_fee_paise >= 0),
  total_payable_paise integer NOT NULL CHECK (total_payable_paise >= 0),
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
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
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  pickup_location text NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  drop_location text NOT NULL,
  drop_lat double precision NOT NULL,
  drop_lng double precision NOT NULL,
  date date NOT NULL,
  time time NOT NULL,
  available_seats integer NOT NULL CHECK (available_seats >= 0),
  price_per_seat_paise integer NOT NULL CHECK (price_per_seat_paise >= 0),
  pricing_area_type text CHECK (pricing_area_type IN ('metro', 'urban', 'rural')),
  quoted_distance_km numeric(8,2) CHECK (quoted_distance_km > 0),
  rate_card_id uuid REFERENCES pricing_rate_cards(id) ON DELETE SET NULL,
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  counterparty_gender_preference text NOT NULL DEFAULT 'any' CHECK (counterparty_gender_preference IN ('any', 'female_only', 'male_only')),
  notification_enabled boolean NOT NULL DEFAULT true,
  max_detour_km numeric(5,2),
  vehicle_details jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_location text NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  drop_location text NOT NULL,
  drop_lat double precision NOT NULL,
  drop_lng double precision NOT NULL,
  date date NOT NULL,
  time time NOT NULL,
  seats_required integer NOT NULL CHECK (seats_required > 0),
  price_per_seat_paise integer NOT NULL CHECK (price_per_seat_paise >= 0),
  pricing_area_type text CHECK (pricing_area_type IN ('metro', 'urban', 'rural')),
  quoted_distance_km numeric(8,2) CHECK (quoted_distance_km > 0),
  rate_card_id uuid REFERENCES pricing_rate_cards(id) ON DELETE SET NULL,
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  counterparty_gender_preference text NOT NULL DEFAULT 'any' CHECK (counterparty_gender_preference IN ('any', 'female_only', 'male_only')),
  notification_enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_offer_id uuid REFERENCES ride_offers(id) ON DELETE CASCADE,
  ride_request_id uuid REFERENCES ride_requests(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seats_booked integer NOT NULL CHECK (seats_booked > 0),
  total_amount_paise integer NOT NULL CHECK (total_amount_paise >= 0),
  platform_fee_paise integer NOT NULL DEFAULT 0 CHECK (platform_fee_paise >= 0),
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  payment_state text NOT NULL,
  expires_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  expired_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_exactly_one_source_chk CHECK (num_nonnulls(ride_offer_id, ride_request_id) = 1),
  CONSTRAINT bookings_distinct_participants_chk CHECK (driver_id <> passenger_id),
  CONSTRAINT bookings_status_chk CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'expired')),
  CONSTRAINT bookings_payment_state_chk CHECK (
    payment_state IN ('unpaid', 'order_created', 'verification_pending', 'paid_escrow', 'failed', 'refund_pending', 'refunded', 'cancelled')
  ),
  CONSTRAINT bookings_version_chk CHECK (version >= 1)
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

CREATE TABLE IF NOT EXISTS booking_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  payer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_fare_paise integer NOT NULL CHECK (ride_fare_paise >= 0),
  platform_fee_paise integer NOT NULL DEFAULT 0 CHECK (platform_fee_paise >= 0),
  total_due_paise integer NOT NULL CHECK (total_due_paise >= 0),
  paid_amount_paise integer NOT NULL DEFAULT 0 CHECK (paid_amount_paise >= 0),
  preferred_payment_method text CHECK (preferred_payment_method IN ('cash', 'upi', 'online')),
  status text NOT NULL CHECK (status IN ('not_due', 'due', 'passenger_marked_paid', 'settled', 'overdue', 'disputed', 'waived')),
  due_at timestamptz,
  passenger_marked_paid_at timestamptz,
  owner_confirmed_received_at timestamptz,
  settled_at timestamptz,
  overdue_at timestamptz,
  dispute_opened_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES booking_settlements(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  previous_status text,
  next_status text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outstanding_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  settlement_id uuid NOT NULL UNIQUE REFERENCES booking_settlements(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount_paise integer NOT NULL CHECK (amount_paise >= 0),
  status text NOT NULL CHECK (status IN ('open', 'under_review', 'cleared', 'waived')),
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz
);

CREATE TABLE IF NOT EXISTS match_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_offer_id uuid NOT NULL REFERENCES ride_offers(id) ON DELETE CASCADE,
  ride_request_id uuid NOT NULL REFERENCES ride_requests(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('open', 'notified', 'dismissed', 'converted', 'expired')),
  score numeric(6,2) NOT NULL CHECK (score >= 0),
  pickup_distance_km numeric(8,3) NOT NULL CHECK (pickup_distance_km >= 0),
  drop_distance_km numeric(8,3) NOT NULL CHECK (drop_distance_km >= 0),
  departure_gap_minutes integer NOT NULL CHECK (departure_gap_minutes >= 0),
  reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_offer_id, ride_request_id)
);

CREATE TABLE IF NOT EXISTS matching_refresh_requests (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_processed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  new_match_push boolean NOT NULL DEFAULT true,
  booking_updates_push boolean NOT NULL DEFAULT true,
  payment_updates_push boolean NOT NULL DEFAULT true,
  marketing_push boolean NOT NULL DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'push')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'read', 'failed')),
  dedupe_key text,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_dedupe_key
  ON notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_student_verifications_user_status
  ON student_verifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_student_verifications_pending_review
  ON student_verifications(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_verifications_revalidate_after
  ON student_verifications(revalidate_after);
CREATE INDEX IF NOT EXISTS idx_driver_eligibility_status
  ON driver_eligibility(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner_status
  ON vehicles(owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_pricing_rate_cards_active_area_vehicle
  ON pricing_rate_cards(is_active, area_type, vehicle_type, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_fare_quotes_created_by_user
  ON fare_quotes(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_offers_driver_status_departure
  ON ride_offers(driver_id, status, date, time);
CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger_status_departure
  ON ride_requests(passenger_id, status, date, time);
CREATE INDEX IF NOT EXISTS idx_ride_offers_notification_enabled
  ON ride_offers(notification_enabled, status, date);
CREATE INDEX IF NOT EXISTS idx_ride_requests_notification_enabled
  ON ride_requests(notification_enabled, status, date);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger_status ON bookings(passenger_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_driver_status ON bookings(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_ride_offer_status ON bookings(ride_offer_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_ride_request_status ON bookings(ride_request_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_expiry_lookup
  ON bookings(status, payment_state, expires_at);
CREATE INDEX IF NOT EXISTS idx_booking_status_events_booking_id_created_at
  ON booking_status_events(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_order_id
  ON payment_orders(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_provider_payment_id
  ON payment_attempts(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_booking_settlements_payer_status
  ON booking_settlements(payer_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_booking_settlements_payee_status
  ON booking_settlements(payee_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_booking_settlements_due_lookup
  ON booking_settlements(status, due_at);
CREATE INDEX IF NOT EXISTS idx_settlement_events_booking_created
  ON settlement_events(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outstanding_balances_user_status
  ON outstanding_balances(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_candidates_offer_status
  ON match_candidates(ride_offer_id, status, score DESC);
CREATE INDEX IF NOT EXISTS idx_match_candidates_request_status
  ON match_candidates(ride_request_id, status, score DESC);
CREATE INDEX IF NOT EXISTS idx_matching_refresh_requests_requested_at
  ON matching_refresh_requests(requested_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_status_created
  ON notifications(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_status
  ON device_tokens(user_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created
  ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_offer_pair
  ON bookings(ride_offer_id, driver_id, passenger_id)
  WHERE ride_offer_id IS NOT NULL AND status IN ('pending', 'confirmed');

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_request_pair
  ON bookings(ride_request_id, driver_id, passenger_id)
  WHERE ride_request_id IS NOT NULL AND status IN ('pending', 'confirmed');

INSERT INTO pricing_rate_cards (
  slug,
  name,
  area_type,
  base_fare_paise,
  per_km_paise,
  minimum_fare_paise,
  platform_fee_fixed_paise,
  platform_fee_bps
)
VALUES
  ('default-metro', 'Default Metro Rate Card', 'metro', 1000, 700, 2500, 800, 500),
  ('default-urban', 'Default Urban Rate Card', 'urban', 500, 500, 1500, 500, 400),
  ('default-rural', 'Default Rural Rate Card', 'rural', 300, 400, 1200, 300, 300)
ON CONFLICT (slug) DO NOTHING;
