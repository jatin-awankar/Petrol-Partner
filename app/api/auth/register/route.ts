import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email, password, full_name, phone } = await req.json();

    // 1. Validate input
    if (!email || !password || !full_name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 2. Check if user already exists (optimized: select only id)
    const existingUser = await query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (existingUser?.rowCount && existingUser.rowCount > 0) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Insert new user
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, phone, created_at`,
      [email, passwordHash, full_name, phone || null]
    );

    const user = result.rows[0];

    // 5. Return success
    return NextResponse.json({
      message: "User registered successfully",
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        created_at: user.created_at,
      },
    });
  } catch (error: any) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
