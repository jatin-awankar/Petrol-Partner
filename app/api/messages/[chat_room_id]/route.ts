import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: any }) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    const { chat_room_id } = await params;

    // Check if user belongs to this chat room (optimized: select only id)
    const roomCheck = await query(
      `SELECT id FROM chat_rooms WHERE id = $1 AND (driver_id = $2 OR passenger_id = $2)`,
      [chat_room_id, userId]
    );

    if (roomCheck.rowCount === 0)
      return NextResponse.json({ error: "Unauthorized or invalid chat room" }, { status: 403 });

    // Fetch messages (optimized: select only needed columns)
    const messages = await query(
      `SELECT id, chat_room_id, sender_id, receiver_id, content, created_at, is_read FROM messages WHERE chat_room_id = $1 ORDER BY created_at ASC`,
      [chat_room_id]
    );

    return NextResponse.json({ messages: messages.rows }, { status: 200 });
  } catch (error: any) {
    console.error("Get messages error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
