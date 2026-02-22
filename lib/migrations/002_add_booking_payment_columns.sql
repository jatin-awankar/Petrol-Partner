-- Adds payment tracking columns required for Razorpay booking lifecycle
-- Safe to run multiple times.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS razorpay_order_id text;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_razorpay_order_id ON bookings(razorpay_order_id);
