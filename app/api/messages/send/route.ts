import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const sender_id = await getAuthenticatedUserId();
    if (!sender_id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    const body = await req.json();
    const { chat_room_id, receiver_id, content } = body;

    if (!chat_room_id || !receiver_id || !content)
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    // Verify sender is part of this chat room (optimized: select only id)
    const roomCheck = await query(
      `SELECT id FROM chat_rooms WHERE id = $1 AND (driver_id = $2 OR passenger_id = $2)`,
      [chat_room_id, sender_id]
    );

    if (roomCheck.rowCount === 0)
      return NextResponse.json({ error: "Unauthorized or invalid chat room" }, { status: 403 });

    // Insert message (optimized: return only needed columns)
    const result = await query(
      `INSERT INTO messages (chat_room_id, sender_id, receiver_id, content)
       VALUES ($1, $2, $3, $4) RETURNING id, chat_room_id, sender_id, receiver_id, content, created_at, is_read`,
      [chat_room_id, sender_id, receiver_id, content]
    );

    return NextResponse.json({ message: "Message sent", data: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error("Send message error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
