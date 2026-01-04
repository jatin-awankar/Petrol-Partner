// lib/middleware.ts
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
      signIn: "/login", // Custom login page
    },
  }
);

// 🧭 Define which routes are protected
export const config = {
  matcher: [
    "/dashboard/:path*",  // Protect all dashboard routes
    "/api/user/:path*",   // Protect user API routes
    "/api/bookings/:path*", // Protect booking API routes
    "/api/rides/:path*",   // Protect ride API routes
    "/api/messages/:path*", // Protect message API routes
    "/api/vehicle/:path*",  // Protect vehicle API routes
    "/profile-settings/:path*", // Protect profile pages
    "/post-a-ride/:path*",  // Protect post ride pages
    "/messages-chat/:path*", // Protect messages pages
  ],
};
