// lib/middleware.ts
import jwt from 'jsonwebtoken';

export function getUserFromAuthHeader(authHeader?: string | null) {
  const auth = authHeader ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!);
    return payload as any;
  } catch {
    return null;
  }
}
