// // app/api/auth/logout/route.ts
// import { NextResponse } from "next/server";

// export async function POST() {
//   try {
//     const response = NextResponse.json({
//       message: "Logout successful",
//     });

//     // Delete JWT cookie
//     response.cookies.set("token", "", {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === "production",
//       sameSite: "strict",
//       path: "/",
//       expires: new Date(0), // immediately expire
//     });

//     return response;
//   } catch (err) {
//     console.error("Logout error:", err);
//     return NextResponse.json(
//       { error: "Internal server error" },
//       { status: 500 }
//     );
//   }
// }
