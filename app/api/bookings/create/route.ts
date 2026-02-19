import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

interface RideDetails {
  owner_id: string;
  price_per_seat: string;
  seats: number;
}

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const { ride_offer_id, ride_request_id, seats_booked = 1 } = body;

  if (!ride_offer_id && !ride_request_id) {
    return NextResponse.json(
      { error: "Either ride_offer_id or ride_request_id is required" },
      { status: 400 }
    );
  }

  if (seats_booked <= 0) {
    return NextResponse.json(
      { error: "Seats booked must be at least 1" },
      { status: 400 }
    );
  }

  // Acquire a dedicated client from the pool for the transaction

  const id = ride_offer_id || ride_request_id;
  const isOffer = !!ride_offer_id;
  const table = isOffer ? "ride_offers" : "ride_requests";
  const seatColumn = isOffer ? "available_seats" : "seats_required";
  const ownerColumn = isOffer ? "driver_id" : "passenger_id";

  const client = await pool.connect();

  try {
    await client.query("BEGIN")

    const rideRes = await client.query<RideDetails>(
      `SELECT ${ownerColumn} as owner_id, price_per_seat, ${seatColumn} as seats
        FROM ${table} WHERE id = $1 FOR UPDATE`,
      [id]
    )

    if (rideRes.rows.length === 0) throw new Error("Ride not found");
    const ride = rideRes.rows[0];

    // 2. Business Logic Checks
    if (ride.owner_id === userId) throw new Error("You cannot book your own ride");
    if (ride.seats < seats_booked) throw new Error("Not enough seats available");

    const driver_id = isOffer ? ride.owner_id : userId;
    const passenger_id = isOffer ? userId : ride.owner_id;
    const totalPrice = parseFloat(ride.price_per_seat) * seats_booked;

    // 3. Create Booking
    const bookingRes = await client.query(
      `INSERT INTO bookings (
        driver_id, passenger_id, ride_offer_id, ride_request_id,
        seats_booked, total_price, status, role
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING id`,
      [driver_id, passenger_id, ride_offer_id || null, ride_request_id || null,
        seats_booked, totalPrice, isOffer ? "passenger" : "driver"]
    );

    // 4. Atomic Decrement
    await client.query(
      `UPDATE ${table} SET ${seatColumn} = ${seatColumn} - $1 WHERE id = $2`,
      [seats_booked, id]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      message: "Booking successful",
      booking_id: bookingRes.rows[0].id,
    });
  } catch (error: any) {
    await client.query("ROLLBACK"); // Undo everything if any step fails
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 400 }
    );
  } finally {
    client.release(); // Return client to the pool
  }
}
