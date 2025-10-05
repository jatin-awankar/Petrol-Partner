// app/api/rides/[rideId]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  req: Request,
  { params }: { params: { rideId: string } }
) {
  try {
    const { rideId } = params;

    // This selects ride + driver profile + vehicle.
    const { data, error } = await supabaseAdmin
      .from("ride_offers")
      .select(
        `
        id,
        origin_address, origin_lat, origin_lng,
        destination_address, destination_lat, destination_lng,
        departure_time,
        available_seats,
        price_per_seat,
        total_distance_km,
        estimated_duration_minutes,
        ride_status,
        created_at,
        updated_at,
        driver:driver_id ( id, clerk_id, full_name, email, avatar_url, college, is_verified, avg_rating ),
        vehicle:vehicle_id ( id, make, model, year, color, license_plate, image, fuel_efficiency )
      `
      )
      .eq("id", rideId)
      .maybeSingle();

    if (error) throw error;
    if (!data)
      return NextResponse.json({ error: "Ride not found" }, { status: 404 });

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("GET /api/rides/[rideId] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
