// lib/jwt.ts
import jwt from 'jsonwebtoken';
import { NextRequest } from "next/server";
import { pool } from "@/lib/db";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET!;

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error('JWT secrets not set in environment variables');
}

export function generateAccessToken(userId: string) {
  return jwt.sign({ userId }, ACCESS_TOKEN_SECRET, { expiresIn: '1d' }); // 1 day expiry
}

export function generateRefreshToken(userId: string) {
  return jwt.sign({ userId }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' }); // 7 days
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET);
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, REFRESH_TOKEN_SECRET);
}

// Extracts user info from Authorization header and verifies JWT
export async function getUserFromToken(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token) as { userId: string };

    if (!decoded?.userId) return null;

    // Fetch the user from DB (optional but recommended to ensure validity)
    const result = await pool.query(
      "SELECT id, email, full_name, is_verified FROM users WHERE id = $1",
      [decoded.userId]
    );

    return result.rows[0] || null;
  } catch (err) {
    console.error("getUserFromToken error:", err);
    return null;
  }
}
