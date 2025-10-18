import { NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/jwt";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader)
      return NextResponse.json({ error: "Authorization header missing" }, { status: 401 });

    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);
    if (typeof payload !== "object" || !("userId" in payload))
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const sender_id = payload.userId;
    const body = await req.json();
    const { chat_room_id, receiver_id, content } = body;

    if (!chat_room_id || !receiver_id || !content)
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    // Verify sender is part of this chat room
    const roomCheck = await query(
      `SELECT * FROM chat_rooms WHERE id = $1 AND (driver_id = $2 OR passenger_id = $2)`,
      [chat_room_id, sender_id]
    );

    if (roomCheck.rowCount === 0)
      return NextResponse.json({ error: "Unauthorized or invalid chat room" }, { status: 403 });

    // Insert message
    const result = await query(
      `INSERT INTO messages (chat_room_id, sender_id, receiver_id, content)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [chat_room_id, sender_id, receiver_id, content]
    );

    return NextResponse.json({ message: "Message sent", data: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error("Send message error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
