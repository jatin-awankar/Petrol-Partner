// lib/cookies.ts
import { NextResponse } from 'next/server';

export const REFRESH_COOKIE_NAME = 'rp_refresh'; // Ride Partner refresh cookie

export function setRefreshCookie(res: NextResponse, token: string, maxAgeSeconds: number) {
  res.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds
  });
}

export function clearRefreshCookie(res: NextResponse) {
  res.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  });
}
