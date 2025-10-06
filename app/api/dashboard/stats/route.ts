import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  try {

    const session = await auth();
    const userId = session.userId

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient();

    // ✅ Total registered users
    const { count: totalUsers, error: usersErr } = await supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true });
    if (usersErr) {
      console.error("profiles count error:", usersErr);
      throw usersErr;
    }

    // ✅ Total booked rides
    const { count: totalBookedRides, error: bookedErr } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true });
    if (bookedErr) {
      console.error("bookings count error:", bookedErr);
      throw bookedErr;
    }

    // ✅ Daily rides
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: dailyRides, error: dailyErr } = await supabase
      .from("ride_offers")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today.toISOString());
    if (dailyErr) {
      console.error("rides daily count error:", dailyErr);
      throw dailyErr;
    }

    // ✅ Active rides
    const { count: totalActiveRides, error: activeErr } = await supabase
      .from("ride_offers")
      .select("*", { count: "exact", head: true })
      .eq("ride_offer_status", "active");
    if (activeErr) {
      console.error("rides active count error:", activeErr);
      throw activeErr;
    }

    // ✅ Ride requests
    const { count: totalRideRequests, error: reqErr } = await supabase
      .from("ride_requests")
      .select("*", { count: "exact", head: true })
      // .eq("status", "pending");
    if (reqErr) {
      console.error("ride_requests count error:", reqErr);
      throw reqErr;
    }

    // ✅ Ride offers (rides created by drivers)
    const { count: totalRideOffers } = await supabase
    .from("ride_offers")
    .select("*", { count: "exact", head: true });

    // ✅ Revenue
    const { data: revenueData, error: revenueErr } = await supabase
      .from("bookings")
      .select("total_price")
      .eq("booking_status", "confirmed");
    if (revenueErr) {
      console.error("revenue error:", revenueErr);
      throw revenueErr;
    }

    const totalRevenue = (revenueData ?? []).reduce(
      (sum, b: { total_price: number | string }) =>
        sum + (Number(b.total_price) || 0),
      0
    );

    return NextResponse.json({
      totalUsers,
      totalBookedRides,
      dailyRides,
      totalActiveRides,
      totalRideRequests,
      totalRideOffers,
      totalRevenue,
    });
  } catch (err: unknown) {
    console.error("Stats API Fatal Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
