// app/api/auth/token/route.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";

/**
 * Returns the compact JWT string for the current session.
 * Client should call this after sign-in and use the token as:
 *   Authorization: Bearer <token>
 *
 * Security: This endpoint reads NextAuth session cookie, so call with credentials included.
 */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    // raw: true -> returns compact JWT string (if available)
    const token = await getToken({ req, secret, raw: true });
    if (!token) {
      return res.status(401).json({ error: "no_session" });
    }
    return res.json({ token });
  } catch (err: any) {
    console.error("token endpoint error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
