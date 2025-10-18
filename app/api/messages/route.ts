// app/api/messages/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyAccessToken } from "@/lib/jwt";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader)
      return NextResponse.json(
        { error: "Authorization header missing" },
        { status: 401 }
      );

    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);
    if (typeof payload !== "object" || !("userId" in payload))
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const sender_id = payload.userId;
    const body = await req.json();
    const { chat_room_id, content } = body;

    if (!chat_room_id || !content)
      return NextResponse.json(
        { error: "chat_room_id and content are required" },
        { status: 400 }
      );

    // Verify chat room and participant
    const chatRes = await query(
      "SELECT * FROM chat_rooms WHERE id = $1 AND is_archived = false",
      [chat_room_id]
    );
    if (chatRes.rowCount === 0)
      return NextResponse.json({ error: "Chat not found or archived" }, { status: 404 });

    const chat = chatRes.rows[0];
    const receiver_id =
      chat.driver_id === sender_id ? chat.passenger_id : chat.driver_id;

    if (sender_id !== chat.driver_id && sender_id !== chat.passenger_id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    // Insert message
    const messageRes = await query(
      `INSERT INTO messages (chat_room_id, sender_id, receiver_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, content, created_at`,
      [chat_room_id, sender_id, receiver_id, content]
    );

    return NextResponse.json({
      message: "Message sent successfully",
      data: messageRes.rows[0],
    });
  } catch (error: any) {
    console.error("Send message error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
