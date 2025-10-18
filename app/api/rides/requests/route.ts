import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAccessToken } from '@/lib/jwt';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader)
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 });

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);
    if (typeof payload !== 'object' || !('userId' in payload)) {
      return NextResponse.json({ error: 'Invalid token payload' }, { status: 401 });
    }
    const passengerId = payload.userId;

    const body = await req.json();
    const {
      pickup_location,
      drop_location,
      pickup_lat,
      pickup_lng,
      drop_lat,
      drop_lng,
      seats_required,
      date,
      time,
      notes,
    } = body;

    if (
      !pickup_location ||
      !drop_location ||
      !pickup_lat ||
      !pickup_lng ||
      !drop_lat ||
      !drop_lng ||
      !seats_required ||
      !date ||
      !time
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO ride_requests 
        (passenger_id, pickup_location, drop_location, pickup_lat, pickup_lng, drop_lat, drop_lng, seats_required, date, time, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        passengerId,
        pickup_location,
        drop_location,
        pickup_lat,
        pickup_lng,
        drop_lat,
        drop_lng,
        seats_required,
        date,
        time,
        notes || null,
      ]
    );

    return NextResponse.json({ ride_request: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error('Create ride request error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}



const PAGE_SIZE = 5;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || PAGE_SIZE.toString());
    const pickup = searchParams.get('pickup');
    const drop = searchParams.get('drop');
    const date = searchParams.get('date');

    const offset = (page - 1) * limit;

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

    let whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    whereClause += (whereClause ? ' AND ' : 'WHERE ') + "status = 'active'";

    // Total count
    const countRes = await query(`SELECT COUNT(*) FROM ride_requests ${whereClause}`, values);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    // Paginated data
    values.push(limit, offset);
    const ridesRes = await query(
      `
      SELECT r.*, u.full_name AS passenger_name, u.profile_image AS passenger_image
      FROM ride_requests r
      JOIN users u ON r.passenger_id = u.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );

    return NextResponse.json({
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      ride_requests: ridesRes.rows,
    });
  } catch (err: any) {
    console.error('List ride requests error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
