// lib/middleware.ts
// import jwt from 'jsonwebtoken';

// export function getUserFromAuthHeader(authHeader?: string | null) {
//   const auth = authHeader ?? '';
//   const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
//   if (!token) return null;
//   try {
//     const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!);
//     return payload as any;
//   } catch {
//     return null;
//   }
// }

// export { default } from "next-auth/middleware";

// export const config = {
//   matcher: ["/dashboard/:path*", "/api/user/:path*"], // protect these routes
// };

// middleware.ts
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// 🔒 Protect routes that require authentication
export default withAuth(
  function middleware(req) {
    // You can add custom logic here if needed
    return NextResponse.next();
  },
  {
    callbacks: {
      // If the user is not authenticated, redirect to login
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/", // 👈 custom login page
    },
  }
);

// 🧭 Define which routes are protected
export const config = {
  matcher: [
    "/dashboard/:path*",  // Protect all dashboard routes
    "/api/user/:path*",   // Protect user API routes
    "/rides/:path*",      // Example: protect ride pages
    "/profile/:path*"     // Example: protect user profile pages
  ],
};
