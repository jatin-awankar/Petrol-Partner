// app/api/messages/chats/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const chatsRes = await query(
      `
      SELECT 
        cr.id AS chat_room_id,
        cr.booking_id,
        cr.driver_id,
        cr.passenger_id,
        u.full_name AS partner_name,
        u.id AS partner_id,
        (SELECT content FROM messages m WHERE m.chat_room_id = cr.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM messages m WHERE m.chat_room_id = cr.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_time
      FROM chat_rooms cr
      JOIN users u ON (CASE WHEN cr.driver_id = $1 THEN cr.passenger_id ELSE cr.driver_id END) = u.id
      WHERE (cr.driver_id = $1 OR cr.passenger_id = $1)
        AND cr.is_archived = false
      ORDER BY last_message_time DESC NULLS LAST
      `,
      [userId]
    );

    return NextResponse.json({ chats: chatsRes.rows });
  } catch (error: any) {
    console.error("Fetch chats error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
