// lib/auth.ts
import "server-only";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";

const ACCESS_TOKEN_SECRET: Secret = process.env.ACCESS_TOKEN_SECRET!;
const ACCESS_TOKEN_EXPIRES = (process.env.ACCESS_TOKEN_EXPIRES || "15m") as SignOptions["expiresIn"];
const REFRESH_TOKEN_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || "30");

if (!ACCESS_TOKEN_SECRET) throw new Error("ACCESS_TOKEN_SECRET not set");

export function signAccessToken(payload: Record<string, any>) {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * Refresh token helpers:
 * - createRefreshToken() -> returns { token, hash, expiresAt }
 * - hashRefreshToken(token) -> hex hash used to store/lookup
 */
export function createRefreshToken() {
  const token = crypto.randomBytes(64).toString("hex"); // 128 chars
  const hash = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 3600 * 1000);
  return { token, hash, expiresAt };
}

export function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

import { NextRequest } from "next/server";
import { pool } from "@/lib/db";

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
