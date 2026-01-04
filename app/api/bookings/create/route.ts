import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function POST(req: Request) {
  try {
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

    // Fetch ride details and creator info
    let rideQuery = "";
    let rideType = "";
    if (ride_offer_id) {
      rideQuery = `
        SELECT id, driver_id, price_per_seat, available_seats
        FROM ride_offers
        WHERE id = $1
      `;
      rideType = "offer";
    } else {
      rideQuery = `
        SELECT id, passenger_id, price_per_seat, seats_required AS available_seats
        FROM ride_requests
        WHERE id = $1
      `;
      rideType = "request";
    }

    const rideRes = await query(rideQuery, [ride_offer_id || ride_request_id]);
    if (!rideRes.rows.length) {
      return NextResponse.json({ error: "Ride not found" }, { status: 404 });
    }

    const ride = rideRes.rows[0];

    // 🚫 Prevent self-booking
    const rideOwnerId = ride.driver_id || ride.passenger_id;
    if (rideOwnerId === userId) {
      return NextResponse.json(
        { error: "You cannot book your own ride" },
        { status: 400 }
      );
    }

    const pricePerSeat = parseFloat(ride.price_per_seat);
    const totalPrice = pricePerSeat * seats_booked;

    // Role logic
    let driver_id: string | null = null;
    let passenger_id: string | null = null;

    if (rideType === "offer") {
      driver_id = ride.driver_id;
      passenger_id = userId;
    } else {
      passenger_id = ride.passenger_id;
      driver_id = userId;
    }

    // Prevent duplicate booking
    const existing = await query(
      `SELECT id FROM bookings
       WHERE driver_id = $1 AND passenger_id = $2 
       AND (ride_offer_id = $3 OR ride_request_id = $4)`,
      [driver_id, passenger_id, ride_offer_id || null, ride_request_id || null]
    );
    if (existing.rows.length) {
      return NextResponse.json(
        { error: "Booking already exists" },
        { status: 400 }
      );
    }

    // Ensure seat availability
    if (seats_booked > ride.available_seats) {
      return NextResponse.json(
        { error: "Not enough seats available" },
        { status: 400 }
      );
    }

    // Create booking
    const result = await query(
      `INSERT INTO bookings (
        driver_id, passenger_id, ride_offer_id, ride_request_id,
        seats_booked, total_price, status, role
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING id, total_price`,
      [
        driver_id,
        passenger_id,
        ride_offer_id || null,
        ride_request_id || null,
        seats_booked,
        totalPrice,
        rideType === "offer" ? "passenger" : "driver",
      ]
    );

    // Decrement seat count in the respective table
    const newAvailable = ride.available_seats - seats_booked;
    const seatUpdateQuery =
      rideType === "offer"
        ? `UPDATE ride_offers SET available_seats = $1 WHERE id = $2`
        : `UPDATE ride_requests SET seats_required = $1 WHERE id = $2`;

    await query(seatUpdateQuery, [
      newAvailable,
      ride_offer_id || ride_request_id,
    ]);

    return NextResponse.json({
      message: "Booking created successfully",
      booking_id: result.rows[0].id,
      total_price: result.rows[0].total_price,
    });
  } catch (error: any) {
    console.error("Booking create error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
