import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await query(
      `SELECT * FROM user_vehicles WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    return NextResponse.json({
      vehicles: result.rows || [],
    });
  } catch (err: any) {
    console.error("Get vehicles error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
