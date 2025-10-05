// app/api/sos/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { rideId, lat, lng, message } = body;

    // map clerk -> profile id
    const { data: profileRow } = await supabaseAdmin
      .from("user_profiles")
      .select("id, full_name")
      .eq("clerk_id", userId)
      .maybeSingle();

    // save a simple log
    await supabaseAdmin.from("sos_logs").insert({
      user_profile_id: profileRow?.id ?? null,
      ride_offer_id: rideId ?? null,
      location_lat: lat ?? null,
      location_lng: lng ?? null,
      message: message ?? null,
      created_at: new Date().toISOString(),
    });

    // TODO: trigger SMS / push / call to emergency contacts
    // e.g. call a serverless function that sends SMS to user's emergency contacts

    return NextResponse.json({ status: "ok" });
  } catch (err: unknown) {
    console.error("POST /api/sos error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
