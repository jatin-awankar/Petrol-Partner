// app/api/bookings/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    // require authenticated user
    const { userId } = await auth();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { rideId, seatsBooked = 1, paymentMethod, pickupAddress } = body;

    if (!rideId) {
      return NextResponse.json(
        { error: "rideId is required" },
        { status: 400 }
      );
    }

    // Map clerk_id -> internal user_profiles.id
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("clerk_id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profileRows) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 400 }
      );
    }

    const riderId = profileRows.id;

    // Create booking
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        rider_id: riderId,
        ride_offer_id: rideId,
        seats_booked: seatsBooked,
        total_price: body.totalPrice ?? null,
        booking_status: "pending",
        pickup_address: pickupAddress ?? null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Optionally update seats on ride_offers (if not handled by trigger)
    // await supabaseAdmin.rpc('decrement_seats', { ride_offer_uuid: rideId, seats: seatsBooked })

    return NextResponse.json({ booking: data });
  } catch (err: unknown) {
    console.error("POST /api/bookings error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
