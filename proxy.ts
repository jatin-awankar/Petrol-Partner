import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ACCESS_TOKEN_COOKIE = "pp_access_token";
const REFRESH_TOKEN_COOKIE = "pp_refresh_token";

export default function proxy(req: NextRequest) {
  const hasAccessToken = Boolean(req.cookies.get(ACCESS_TOKEN_COOKIE)?.value);
  const hasRefreshToken = Boolean(req.cookies.get(REFRESH_TOKEN_COOKIE)?.value);

  if (hasAccessToken || hasRefreshToken) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/user/:path*",
    "/api/bookings/:path*",
    "/api/rides/:path*",
    "/api/messages/:path*",
    "/api/vehicle/:path*",
    "/profile-settings",
    "/profile-settings/:path*",
    "/post-a-ride/:path*",
    "/messages-chat/:path*",
    "/search-rides/:path*",
    "/payments/:path*",
  ],
};
