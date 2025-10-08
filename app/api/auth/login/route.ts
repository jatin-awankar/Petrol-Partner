// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { comparePassword, createToken } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Check if user exists
    const { data: user, error: fetchError } = await supabase
      .from("profiles")
      .select("id, email, password, full_name, college_name, is_verified")
      .eq("email", email)
      .single();

    if (fetchError || !user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Compare password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Create JWT token
    const token = createToken({ id: user.id, email: user.email });

    // Remove sensitive info before sending
    const { password: _, ...safeUser } = user;

    // Send token as HttpOnly cookie
    const response = NextResponse.json({
      message: "Login successful",
      user: safeUser,
      token,
    });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
