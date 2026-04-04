CREATE TABLE IF NOT EXISTS chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked')),
  locked_at timestamptz,
  delete_after timestamptz,
  last_message_at timestamptz,
  driver_last_read_at timestamptz,
  passenger_last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_rooms_distinct_participants_chk CHECK (driver_id <> passenger_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_booking_id ON chat_rooms(booking_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_driver_status ON chat_rooms(driver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_passenger_status ON chat_rooms(passenger_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_delete_after ON chat_rooms(delete_after) WHERE delete_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created_at ON chat_messages(chat_room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id, created_at DESC);

INSERT INTO chat_rooms (
  booking_id,
  driver_id,
  passenger_id,
  status,
  locked_at,
  delete_after,
  created_at,
  updated_at
)
SELECT
  b.id,
  b.driver_id,
  b.passenger_id,
  CASE WHEN b.status = 'confirmed' THEN 'active' ELSE 'locked' END AS status,
  CASE
    WHEN b.status = 'confirmed' THEN NULL
    ELSE COALESCE(b.completed_at, b.cancelled_at, b.expired_at, b.updated_at, now())
  END AS locked_at,
  CASE
    WHEN b.status = 'confirmed' THEN NULL
    ELSE COALESCE(b.completed_at, b.cancelled_at, b.expired_at, b.updated_at, now()) + interval '7 days'
  END AS delete_after,
  b.created_at,
  b.updated_at
FROM bookings b
WHERE b.status IN ('confirmed', 'completed', 'cancelled', 'expired')
ON CONFLICT (booking_id) DO NOTHING;
