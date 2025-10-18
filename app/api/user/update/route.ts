import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyAccessToken } from '@/lib/jwt';

export async function PATCH(req: Request) {
  try {
    // 1. Get access token from Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
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

    // 3. Parse request body
    const { full_name, phone, profile_image } = await req.json();

    // 4. Update user profile
    const result = await query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           profile_image = COALESCE($3, profile_image),
           updated_at = now()
       WHERE id = $4
       RETURNING id, email, full_name, phone, profile_image, is_verified, role, created_at, updated_at`,
      [full_name, phone, profile_image, userId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updatedUser = result.rows[0];

    return NextResponse.json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
