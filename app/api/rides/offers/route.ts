import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyAccessToken } from "@/lib/jwt";

export async function POST(req: Request) {
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
    const driverId = payload.userId;

    const body = await req.json();
    const {
      pickup_location,
      drop_location,
      pickup_lat,
      pickup_lng,
      drop_lat,
      drop_lng,
      available_seats,
      price_per_seat,
      date,
      time,
      vehicle_details,
      notes,
    } = body;

    if (
      !pickup_location ||
      !drop_location ||
      !pickup_lat ||
      !pickup_lng ||
      !drop_lat ||
      !drop_lng ||
      !available_seats ||
      !price_per_seat ||
      !date ||
      !time
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO ride_offers 
        (driver_id, pickup_location, drop_location, pickup_lat, pickup_lng, drop_lat, drop_lng, available_seats, price_per_seat, date, time, vehicle_details, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        driverId,
        pickup_location,
        drop_location,
        pickup_lat,
        pickup_lng,
        drop_lat,
        drop_lng,
        available_seats,
        price_per_seat,
        date,
        time,
        vehicle_details || null,
        notes || null,
      ]
    );

    return NextResponse.json({ ride_offer: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("Create ride offer error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

const PAGE_SIZE = 5; // Default pagination size

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = "offer";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || PAGE_SIZE.toString());
    const pickup = searchParams.get("pickup");
    const drop = searchParams.get("drop");
    const date = searchParams.get("date");

    const offset = (page - 1) * limit;

    // Build dynamic filter query
    const filters = [];
    const values: any[] = [];

    if (pickup) {
      values.push(`%${pickup}%`);
      filters.push(`pickup_location ILIKE $${values.length}`);
    }

    if (drop) {
      values.push(`%${drop}%`);
      filters.push(`drop_location ILIKE $${values.length}`);
    }

    if (date) {
      values.push(date);
      filters.push(`date = $${values.length}`);
    }

    let whereClause =
      filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    whereClause += (whereClause ? " AND " : "WHERE ") + "status = 'active'";

    // Query total count
    const countQuery = `SELECT COUNT(*) FROM ride_offers ${whereClause}`;
    const countRes = await query(countQuery, values);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    // Query paginated data
    values.push(limit);
    values.push(offset);

    const ridesQuery = `
      SELECT r.*, u.full_name, u.email, u.phone, u.is_verified, u.created_at, u.role, u.college, u.profile_image, u.avg_rating, u.age
      FROM ride_offers r
      JOIN users u ON r.driver_id = u.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length};
    `;

    const ridesRes = await query(ridesQuery, values);
    const rides = ridesRes.rows;

    return NextResponse.json({
      type,
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      rides,
    });
  } catch (error: any) {
    console.error("List ride offers error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
