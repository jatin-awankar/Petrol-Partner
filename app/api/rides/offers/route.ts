import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const driverId = await getAuthenticatedUserId();
    if (!driverId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

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

const PAGE_SIZE = 5; // default pagination size
const SEARCH_RADIUS_KM = 1; // 1 km radius

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(
      searchParams.get("limit") || PAGE_SIZE.toString(),
      10
    );
    const pickup_lat = searchParams.get("pickup_lat");
    const pickup_lng = searchParams.get("pickup_lng");
    const date = searchParams.get("date");

    const offset = (page - 1) * limit;
    const filters: string[] = ["r.status = 'active'"];
    const values: any[] = [];

    // Optional date filter
    if (date) {
      values.push(date);
      filters.push(`r.date = $${values.length}`);
    }

    const sqlValues = [...values];
    let sql: string;

    if (pickup_lat && pickup_lng) {
      const lat = parseFloat(pickup_lat);
      const lng = parseFloat(pickup_lng);

      sqlValues.push(lat, lng, SEARCH_RADIUS_KM, limit, offset);
      const latIndex = sqlValues.length - 4;
      const lngIndex = sqlValues.length - 3;
      const radiusIndex = sqlValues.length - 2;
      const limitIndex = sqlValues.length - 1;
      const offsetIndex = sqlValues.length;

      sql = `
        SELECT 
          r.*,
          u.full_name,
          u.email,
          u.phone,
          u.is_verified,
          u.college,
          u.profile_image,
          u.avg_rating,
          (6371 * acos(
            cos(radians($${latIndex})) * cos(radians(r.pickup_lat)) *
            cos(radians(r.pickup_lng) - radians($${lngIndex})) +
            sin(radians($${latIndex})) * sin(radians(r.pickup_lat))
          )) AS distance_km
        FROM ride_offers r
        JOIN users u ON r.driver_id = u.id
        WHERE ${filters.join(" AND ")}
        AND (6371 * acos(
            cos(radians($${latIndex})) * cos(radians(r.pickup_lat)) *
            cos(radians(r.pickup_lng) - radians($${lngIndex})) +
            sin(radians($${latIndex})) * sin(radians(r.pickup_lat))
        )) <= $${radiusIndex}
        ORDER BY distance_km ASC
        LIMIT $${limitIndex} OFFSET $${offsetIndex};
      `;
    } else {
      // No location → default ordering
      sqlValues.push(limit, offset);
      const limitIndex = sqlValues.length - 1;
      const offsetIndex = sqlValues.length;

      sql = `
        SELECT 
          r.*,
          u.full_name,
          u.email,
          u.phone,
          u.is_verified,
          u.college,
          u.profile_image,
          u.avg_rating
        FROM ride_offers r
        JOIN users u ON r.driver_id = u.id
        WHERE ${filters.join(" AND ")}
        ORDER BY r.created_at DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex};
      `;
    }

    // Count total rides
    const countQuery = `SELECT COUNT(*) FROM ride_offers r WHERE ${filters.join(
      " AND "
    )}`;
    const countRes = await query(countQuery, values);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    const ridesRes = await query(sql, sqlValues);
    const rides = ridesRes.rows.map((ride) => ({
      ...ride,
      date: ride.date,
    }));

    return NextResponse.json({
      success: true,
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      rides,
    });
  } catch (error: any) {
    console.error("List ride offers error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
