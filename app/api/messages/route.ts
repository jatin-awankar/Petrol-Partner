// app/api/messages/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthenticatedUserId } from "@/lib/auth";

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
    const { chat_room_id, content } = body;

    if (!chat_room_id || !content)
      return NextResponse.json(
        { error: "chat_room_id and content are required" },
        { status: 400 }
      );

    // Verify chat room and participant (optimized: select only needed columns)
    const chatRes = await query(
      "SELECT driver_id, passenger_id FROM chat_rooms WHERE id = $1 AND is_archived = false",
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
