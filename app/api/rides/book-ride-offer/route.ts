import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(request: NextRequest) {
  try {
    const { rideId, seats } = await request.json();
    const user = await currentUser();

    // Fetch user's profile ID
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("clerk_id", user?.id)
      .single();
    
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data: ride, error: rideError } = await supabaseAdmin
        .from("rides")
        .select("price_per_seat, driver_id")
        .eq("id", rideId)
        .single();
    
    if (rideError) throw rideError;

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .insert([
        {
          ride_id: rideId,
          driver_id: ride?.driver_id,
          passenger_id: profile?.id,
          seats_booked: seats,
          total_price: seats * (ride?.price_per_seat || 0),
          status: "active",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ message: "Booking created", data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
};
