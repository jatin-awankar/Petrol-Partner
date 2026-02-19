// lib/auth.ts - Helper function to get authenticated user from NextAuth session
import { getServerSession } from "next-auth";
import { authOptions } from "./authOptions";
import { query } from "./db";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Get the authenticated user's ID from NextAuth session
 * Returns null if not authenticated
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    // session.user.id may come from provider claims in some flows.
    // Always verify it belongs to our users table before using it as FK.
    if (UUID_V4_REGEX.test(session.user.id)) {
      const idCheck = await query("SELECT id FROM users WHERE id = $1", [
        session.user.id,
      ]);
      if (idCheck.rowCount && idCheck.rowCount > 0) {
        return idCheck.rows[0].id;
      }
    }
  }

  if (!session?.user?.email) {
    return null;
  }

  // Get user ID from database using email (more reliable than relying on session.user.id)
  const result = await query(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email]
  );

  return result.rows[0]?.id || null;
}

/**
 * Get the authenticated user's full data from database
 * Returns null if not authenticated or user not found
 */
export async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return null;
  }

  const result = await query(
    "SELECT id, email, full_name, phone, college, profile_image, is_verified, role, created_at, updated_at, avg_rating FROM users WHERE email = $1",
    [session.user.email]
  );

  return result.rows[0] || null;
}

