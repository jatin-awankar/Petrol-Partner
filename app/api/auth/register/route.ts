import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email, password, full_name, phone, college_name } = await req.json();

    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedName = full_name?.trim();
    const normalizedPhone = phone?.trim() || null;
    const normalizedCollege = college_name?.trim() || null;

    if (!normalizedEmail || !password || !normalizedName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const existingUser = await query(
      "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1",
      [normalizedEmail]
    );

    if (existingUser?.rowCount && existingUser.rowCount > 0) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, phone, college)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, phone, college, created_at`,
      [
        normalizedEmail,
        passwordHash,
        normalizedName,
        normalizedPhone,
        normalizedCollege,
      ]
    );

    const user = result.rows[0];

    return NextResponse.json({
      message: "User registered successfully",
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        college: user.college,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
