// lib/auth.ts
import jwt, { JwtPayload } from "jsonwebtoken";
import bcrypt from "bcryptjs";

/**
 * ============================================================
 * 🔒 AUTH UTILITIES (JWT + PASSWORD HASHING)
 * ============================================================
 * - Uses bcryptjs for password hashing
 * - Uses JWT for stateless authentication
 * - Works with HttpOnly cookies or client-side storage
 * ============================================================
 */

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("❌ Missing JWT_SECRET in environment variables");
}

/**
 * Interface for user payload stored in JWT
 */
export interface UserPayload {
  id: string;
  email: string;
}

/**
 * Create a signed JWT token for a user
 */
export function createToken(user: UserPayload): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    JWT_SECRET as string,
    {
      expiresIn: "7d", // token validity (7 days)
      algorithm: "HS256",
    }
  );
}

/**
 * Verify and decode a JWT token
 * @returns Decoded payload if valid, null if invalid or expired
 */
export function verifyToken(token: string): JwtPayload | null {
  if (!JWT_SECRET) {
    console.warn("JWT_SECRET is not defined.");
    return null;
  }
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    console.warn("Invalid or expired token:", error);
    return null;
  }
}

/**
 * Hash a plaintext password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12); // higher salt rounds for stronger hash
  return bcrypt.hash(password, salt);
}

/**
 * Compare a plaintext password against a hashed password
 */
export async function comparePassword(
  password: string,
  hashed: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hashed);
  } catch (error) {
    console.error("Password comparison failed:", error);
    return false;
  }
}
