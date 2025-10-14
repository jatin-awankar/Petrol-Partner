// // app/api/auth/register/route.ts
// import { NextResponse } from "next/server";
// import { supabase } from "@/lib/supabase";
// import { hashPassword, createToken } from "@/lib/auth";

// export async function POST(req: Request) {
//   try {
//     const { full_name, email, password, college_name } = await req.json();

//     // Validate required fields
//     if (!full_name || !email || !password) {
//       return NextResponse.json(
//         { error: "Full name, email, and password are required" },
//         { status: 400 }
//       );
//     }

//     // Check if user already exists
//     const { data: existingUser, error: checkError } = await supabase
//       .from("profiles")
//       .select("id")
//       .eq("email", email)
//       .single();

//     if (checkError && checkError.code !== "PGRST116") {
//       // PGRST116 = no rows found (safe to ignore)
//       console.error("Database check error:", checkError);
//       return NextResponse.json(
//         { error: "Failed to verify existing user" },
//         { status: 500 }
//       );
//     }

//     if (existingUser) {
//       return NextResponse.json(
//         { error: "Email already registered" },
//         { status: 409 }
//       );
//     }

//     // Hash the password securely
//     const hashedPassword = await hashPassword(password);

//     // Create new user record
//     const { data: newUser, error: insertError } = await supabase
//       .from("profiles")
//       .insert([
//         {
//           full_name,
//           email,
//           password: hashedPassword,
//           college_name: college_name || null,
//           is_verified: false,
//           created_at: new Date().toISOString(),
//         },
//       ])
//       .select()
//       .single();

//     if (insertError || !newUser) {
//       console.error("Error creating user:", insertError);
//       return NextResponse.json(
//         { error: "Failed to create user" },
//         { status: 500 }
//       );
//     }

//     // Generate JWT token
//     const token = createToken({ id: newUser.id, email: newUser.email });

//     // Create response
//     const response = NextResponse.json({
//       message: "Registration successful",
//       user: {
//         id: newUser.id,
//         full_name: newUser.full_name,
//         email: newUser.email,
//         college_name: newUser.college_name,
//       },
//       token,
//     });

//     // Optionally set cookie (for automatic login)
//     response.cookies.set("token", token, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === "production",
//       maxAge: 7 * 24 * 60 * 60, // 7 days
//       sameSite: "lax",
//       path: "/",
//     });

//     return response;
//   } catch (err) {
//     if (err instanceof Error) {
//       console.error("Registration error:", err);
//       return NextResponse.json(
//         { error: "Internal server error", details: err.message },
//         { status: 500 }
//       );
//     } else {
//       console.error("Registration error:", err);
//       return NextResponse.json(
//         { error: "Internal server error", details: "Unknown error" },
//         { status: 500 }
//       );
//     };
//   }
// }
