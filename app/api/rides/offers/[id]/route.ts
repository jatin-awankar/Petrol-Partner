import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id)
      return NextResponse.json({ error: 'Ride ID missing' }, { status: 400 });

    const rideQuery = `
      SELECT 
        r.id,
        r.driver_id,
        u.full_name AS driver_name,
        u.email AS driver_email,
        u.phone AS driver_phone,
        u.profile_image AS driver_image,
        COALESCE(u.avg_rating, 0) AS driver_rating,
        r.pickup_location,
        r.drop_location,
        r.pickup_lat,
        r.pickup_lng,
        r.drop_lat,
        r.drop_lng,
        r.available_seats,
        r.price_per_seat,
        r.date,
        r.time,
        r.vehicle_details,
        r.notes,
        r.status,
        r.created_at
      FROM ride_offers r
      JOIN users u ON r.driver_id = u.id
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


import { verifyAccessToken } from '@/lib/jwt';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader)
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 });

    const token = authHeader.split(' ')[1];
    const payload: any = verifyAccessToken(token);
    const driverId = payload.userId;

    const rideId = params.id;
    if (!rideId)
      return NextResponse.json({ error: 'Ride ID missing' }, { status: 400 });

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
      status,
    } = body;

    // Only allow driver to update their own ride
    const checkQuery = await query(
      'SELECT driver_id FROM ride_offers WHERE id = $1',
      [rideId]
    );

    if (checkQuery.rowCount === 0)
      return NextResponse.json({ error: 'Ride not found' }, { status: 404 });

    if (checkQuery.rows[0].driver_id !== driverId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    // Update ride
    const updateQuery = `
      UPDATE ride_offers
      SET
        pickup_location = COALESCE($1, pickup_location),
        drop_location = COALESCE($2, drop_location),
        pickup_lat = COALESCE($3, pickup_lat),
        pickup_lng = COALESCE($4, pickup_lng),
        drop_lat = COALESCE($5, drop_lat),
        drop_lng = COALESCE($6, drop_lng),
        available_seats = COALESCE($7, available_seats),
        price_per_seat = COALESCE($8, price_per_seat),
        date = COALESCE($9, date),
        time = COALESCE($10, time),
        vehicle_details = COALESCE($11, vehicle_details),
        notes = COALESCE($12, notes),
        status = COALESCE($13, status),
        updated_at = now()
      WHERE id = $14
      RETURNING *;
    `;

    const values = [
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
      status,
      rideId,
    ];

    const result = await query(updateQuery, values);

    return NextResponse.json({
      message: 'Ride updated successfully',
      ride: result.rows[0],
    });
  } catch (err: any) {
    console.error('Update ride offer error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
