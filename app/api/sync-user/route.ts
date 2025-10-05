import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { auth } from "@clerk/nextjs/server";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // fetch Clerk user directly
    const clerkRes = await fetch(`https://api.clerk.dev/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
    });
    const clerkUser = await clerkRes.json();

    const full_name = `${clerkUser.first_name || ""} ${clerkUser.last_name || ""}`.trim();
    const email = clerkUser.email_addresses?.[0]?.email_address || null;

    // college verification: e.g. email ends with ".edu" or from your domain
    const college = email?.split("@")[1];
    const is_verified = email?.endsWith(".edu") || email?.endsWith("college.ac.in") || false;

    const avatar_url = clerkUser.image_url || null;

    // upsert into profiles
    const { error } = await supabaseAdmin.from("user_profiles").upsert(
      {
        clerk_id: userId,
        full_name,
        email,
        college,
        is_verified,
        avatar_url,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clerk_id" }
    );

    if (error) throw error;

    return NextResponse.json({ message: "User synced successfully" });
  } catch (err: unknown) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
