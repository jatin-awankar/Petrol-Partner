import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAccessToken } from '@/lib/jwt';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader)
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 });

    const token = authHeader.split(' ')[1];
    const payload: any = verifyAccessToken(token);
    const passengerId = payload.userId;

    const body = await req.json();
    const { ride_offer_id, ride_request_id, seats_booked } = body;

    if (!ride_offer_id || !ride_request_id || !seats_booked)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    // Fetch ride_offer details
    const rideOfferRes = await query('SELECT * FROM ride_offers WHERE id = $1 AND status = $2', [ride_offer_id, 'active']);
    if (rideOfferRes.rowCount === 0)
      return NextResponse.json({ error: 'Ride offer not found or inactive' }, { status: 404 });

    const rideOffer = rideOfferRes.rows[0];

    if (seats_booked > rideOffer.available_seats)
      return NextResponse.json({ error: 'Not enough seats available' }, { status: 400 });

    // Fetch ride_request details
    const rideRequestRes = await query('SELECT * FROM ride_requests WHERE id = $1 AND status = $2 AND passenger_id = $3', [ride_request_id, 'active', passengerId]);
    if (rideRequestRes.rowCount === 0)
      return NextResponse.json({ error: 'Ride request not found or inactive' }, { status: 404 });

    const rideRequest = rideRequestRes.rows[0];

    // Create booking
    const price_total = seats_booked * parseFloat(rideOffer.price_per_seat);
    const bookingRes = await query(
      `INSERT INTO bookings (ride_offer_id, ride_request_id, driver_id, passenger_id, seats_booked, price_total)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [ride_offer_id, ride_request_id, rideOffer.driver_id, passengerId, seats_booked, price_total]
    );

    // Reduce available seats in ride_offer
    await query('UPDATE ride_offers SET available_seats = available_seats - $1 WHERE id = $2', [seats_booked, ride_offer_id]);

    // Mark ride_request as matched
    await query('UPDATE ride_requests SET status = $1 WHERE id = $2', ['matched', ride_request_id]);

    return NextResponse.json({ booking: bookingRes.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error('Create booking error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


// app/api/bookings/route.ts
import { NextRequest } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "5");
    const offset = (page - 1) * limit;

    let baseQuery = `
      SELECT 
        b.id AS booking_id,
        b.status,
        b.created_at,
        r.id AS ride_id,
        r.pickup_location,
        r.drop_location,
        r.date,
        r.time,
        u.full_name AS driver_name,
        u.email AS driver_email
      FROM bookings b
      JOIN rides r ON b.ride_id = r.id
      JOIN users u ON r.driver_id = u.id
      WHERE b.user_id = $1
    `;

    const params: any[] = [user.id];

    if (status) {
      baseQuery += ` AND b.status = $2`;
      params.push(status);
    }

    baseQuery += ` ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(baseQuery, params);

    return NextResponse.json({
      success: true,
      bookings: result.rows,
      pagination: { page, limit },
    });
  } catch (err) {
    console.error("GET /bookings error:", err);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}
