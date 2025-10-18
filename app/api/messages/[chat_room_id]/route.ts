import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/jwt";
import { query } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: any }) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader)
      return NextResponse.json({ error: "Authorization header missing" }, { status: 401 });

    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);
    if (typeof payload !== "object" || !("userId" in payload))
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const userId = payload.userId;
    const { chat_room_id } = await params;

    // Check if user belongs to this chat room
    const roomCheck = await query(
      `SELECT * FROM chat_rooms WHERE id = $1 AND (driver_id = $2 OR passenger_id = $2)`,
      [chat_room_id, userId]
    );

    if (roomCheck.rowCount === 0)
      return NextResponse.json({ error: "Unauthorized or invalid chat room" }, { status: 403 });

    // Fetch messages
    const messages = await query(
      `SELECT * FROM messages WHERE chat_room_id = $1 ORDER BY created_at ASC`,
      [chat_room_id]
    );

    return NextResponse.json({ messages: messages.rows }, { status: 200 });
  } catch (error: any) {
    console.error("Get messages error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
