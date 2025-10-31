import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  try {
    // 1️⃣ Optionally clear your legacy refresh token cookie (if it exists)
    const cookieStore = await cookies();
    const refreshToken = await cookieStore.get?.("refresh_token");

    if (refreshToken) {
      const res = NextResponse.json({ message: "Logged out successfully" });
      res.cookies.set?.({
        name: "refresh_token",
        value: "",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 0, // expire immediately
      });
      return res;
    }

    // 2️⃣ Simply respond — NextAuth signOut() will clear its own cookies
    return NextResponse.json({ message: "Logged out successfully" });
  } catch (error: any) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
