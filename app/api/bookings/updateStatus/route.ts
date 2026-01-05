import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthenticatedUserId } from "@/lib/auth";

export async function PATCH(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2️⃣ Parse body
    const body = await req.json();
    const { booking_id, new_status } = body;

    if (!booking_id || !['pending', 'confirmed', 'cancelled', 'completed'].includes(new_status)) {
      return NextResponse.json({ error: 'Invalid booking ID or status' }, { status: 400 });
    }

    // 3️⃣ Fetch the booking (optimized: select only needed columns)
    const bookingRes = await query(
      'SELECT driver_id, passenger_id, status, ride_offer_id, ride_request_id, seats_booked FROM bookings WHERE id = $1',
      [booking_id]
    );
    if (bookingRes.rowCount === 0)
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

    const booking = bookingRes.rows[0];

    // 4️⃣ Authorization: only driver or passenger can update
    if (booking.driver_id !== userId && booking.passenger_id !== userId) {
      return NextResponse.json({ error: 'Not authorized to update this booking' }, { status: 403 });
    }

    // 5️⃣ Prevent illegal transitions
    if (booking.status === 'completed' || booking.status === 'cancelled') {
      return NextResponse.json({ error: 'Cannot change a completed or cancelled booking' }, { status: 400 });
    }

    // 6️⃣ Update status
    await query('UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2', [new_status, booking_id]);

    // 7️⃣ If confirmed, auto-create chat room (only if not already created)
    if (new_status === 'confirmed') {
      const existingChat = await query(
        `SELECT id FROM chat_rooms WHERE booking_id = $1`,
        [booking_id]
      );

      if (existingChat.rowCount === 0) {
        await query(
          `INSERT INTO chat_rooms (booking_id, driver_id, passenger_id, created_at)
           VALUES ($1, $2, $3, now())`,
          [booking_id, booking.driver_id, booking.passenger_id]
        );
        console.log('Chat room created for booking:', booking_id);
      }
    }

    // 8️⃣ If cancelled, restore seats
    if (new_status === 'cancelled') {
      if (booking.ride_offer_id) {
        await query(
          'UPDATE ride_offers SET available_seats = available_seats + $1 WHERE id = $2',
          [booking.seats_booked, booking.ride_offer_id]
        );
      }
      if (booking.ride_request_id) {
        await query(
          'UPDATE ride_requests SET seats_required = seats_required + $1 WHERE id = $2',
          [booking.seats_booked, booking.ride_request_id]
        );
      }
    }
    
    // 9️⃣ If completed or cancelled, archive or delete chat room
    if (new_status === "completed" || new_status === "cancelled") {
      // Option A: Archive the chat (recommended)
      await query(
        "UPDATE chat_rooms SET is_archived = true WHERE booking_id = $1",
        [booking_id]
      );
    
      // Option B (hard delete): Uncomment if you prefer deletion
      // await query("DELETE FROM chat_rooms WHERE booking_id = $1", [booking_id]);
    }

    return NextResponse.json({ message: 'Booking status updated successfully', new_status });
  } catch (error: any) {
    console.error('Update booking status error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

