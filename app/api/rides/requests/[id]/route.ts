import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuthenticatedUserId } from '@/lib/auth';

// GET ride details by ID
export async function GET(req: NextRequest, context: any) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'Ride ID missing' }, { status: 400 });
    }

    const rideQuery = `
      SELECT 
        r.id,
        r.passenger_id,
        u.full_name AS passenger_name,
        u.email AS passenger_email,
        u.phone AS passenger_phone,
        u.profile_image AS passenger_image,
        COALESCE(u.avg_rating, 0) AS passenger_rating,
        r.pickup_location,
        r.drop_location,
        r.pickup_lat,
        r.pickup_lng,
        r.drop_lat,
        r.drop_lng,
        r.seats_required,
        r.date,
        r.time,
        r.notes,
        r.status,
        r.created_at
      FROM ride_requests r
      JOIN users u ON r.passenger_id = u.id
      WHERE r.id = $1
      LIMIT 1;
    `;

    const result = await query(rideQuery, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    }

    return NextResponse.json({ ride: result.rows[0] }, { status: 200 });
  } catch (error: any) {
    console.error('Get ride details error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH ride by ID (requires auth)
export async function PATCH(req: NextRequest, context: any) {
  try {
    const passengerId = await getAuthenticatedUserId();
    if (!passengerId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: requestId } = await context.params;
    if (!requestId) {
      return NextResponse.json({ error: 'Ride request ID missing' }, { status: 400 });
    }

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
      status,
    } = body;

    // Only allow passenger to update their own request
    const checkQuery = await query(
      'SELECT passenger_id FROM ride_requests WHERE id = $1',
      [requestId]
    );

    if (checkQuery.rowCount === 0) {
      return NextResponse.json({ error: 'Ride request not found' }, { status: 404 });
    }

    if (checkQuery.rows[0].passenger_id !== passengerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Update ride request
    const updateQuery = `
      UPDATE ride_requests
      SET
        pickup_location = COALESCE($1, pickup_location),
        drop_location = COALESCE($2, drop_location),
        pickup_lat = COALESCE($3, pickup_lat),
        pickup_lng = COALESCE($4, pickup_lng),
        drop_lat = COALESCE($5, drop_lat),
        drop_lng = COALESCE($6, drop_lng),
        seats_required = COALESCE($7, seats_required),
        date = COALESCE($8, date),
        time = COALESCE($9, time),
        notes = COALESCE($10, notes),
        status = COALESCE($11, status),
        updated_at = now()
      WHERE id = $12
      RETURNING *;
    `;

    const values = [
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
      status,
      requestId,
    ];

    const result = await query(updateQuery, values);

    return NextResponse.json({
      message: 'Ride request updated successfully',
      ride_request: result.rows[0],
    });
  } catch (err: any) {
    console.error('Update ride request error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
