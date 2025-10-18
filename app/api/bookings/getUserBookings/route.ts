import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyAccessToken } from "@/lib/jwt";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader)
      return NextResponse.json(
        { error: "Authorization header missing" },
        { status: 401 }
      );

    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);
    if (typeof payload !== "object" || !("userId" in payload)) {
      return NextResponse.json(
        { error: "Invalid token payload" },
        { status: 401 }
      );
    }

    const userId = payload.userId;
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get pagination params
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "5");
    const offset = parseInt(searchParams.get("offset") || "0");

    // 🔍 Fetch all bookings where user is involved (either driver or passenger)
    const result = await query(
      `
      SELECT 
        b.id AS booking_id,
        b.status,
        b.created_at,
        b.updated_at,
        b.role,
        b.driver_id,
        b.passenger_id,
        b.seats_booked,
        b.total_price,
        COALESCE(ro.id, rr.id) AS ride_id,
        COALESCE(ro.pickup_location, rr.pickup_location) AS pickup_location,
        COALESCE(ro.drop_location, rr.drop_location) AS drop_location,
        COALESCE(ro.date, rr.date) AS date,
        COALESCE(ro.time, rr.time) AS time,
        COALESCE(ro.price_per_seat, rr.price_per_seat) AS price_per_seat,
        u.full_name AS other_user_name,
        u.email AS other_user_email,
        CASE
          WHEN b.driver_id = $1 THEN 'driver'
          WHEN b.passenger_id = $1 THEN 'passenger'
        END AS user_role
      FROM bookings b
      LEFT JOIN ride_offers ro ON b.ride_offer_id = ro.id
      LEFT JOIN ride_requests rr ON b.ride_request_id = rr.id
      JOIN users u 
        ON (b.driver_id = $1 AND u.id = b.passenger_id)
        OR (b.passenger_id = $1 AND u.id = b.driver_id)
      WHERE 
        b.driver_id = $1 OR b.passenger_id = $1
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3;
      `,
      [userId, limit, offset]
    );

    return NextResponse.json({
      bookings: result.rows,
      pagination: { limit, offset, count: result.rows.length },
    });
  } catch (error: any) {
    console.error("Get bookings error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
