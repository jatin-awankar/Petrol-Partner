import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAccessToken } from '@/lib/jwt';

export async function GET(req: Request) {
  try {
    // 1. Get access token from Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    if (!token) {
      return NextResponse.json({ error: 'Access token missing' }, { status: 401 });
    }

    // 2. Verify JWT
    let payload: any;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 });
    }

    const userId = payload.userId;

    // 3. Fetch user profile from DB
    const result = await query(
      'SELECT id, email, full_name, phone, profile_image, is_verified, role, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = result.rows[0];

    // 4. Return user data
    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
