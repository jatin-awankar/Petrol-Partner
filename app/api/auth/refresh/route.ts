import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from '@/lib/jwt';
import crypto from 'crypto';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    // 1. Get refresh token from cookie or request body
    let refreshToken = (await cookies()).get('refresh_token')?.value;
    if (!refreshToken) {
      const body = await req.json();
      refreshToken = body.refreshToken;
    }

    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token missing' }, { status: 400 });
    }

    // 2. Verify JWT signature
    let payload: any;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return NextResponse.json({ error: 'Invalid refresh token' }, { status: 403 });
    }

    const userId = payload.userId;

    // 3. Check if hashed token exists in DB
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const result = await query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()',
      [userId, tokenHash]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Refresh token invalid or expired' }, { status: 403 });
    }

    // 4. Generate new tokens
    const newAccessToken = generateAccessToken(userId);
    const newRefreshToken = generateRefreshToken(userId);

    // 5. Update refresh token in DB
    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
      `UPDATE refresh_tokens
       SET token_hash = $1, expires_at = $2, created_at = now()
       WHERE user_id = $3`,
      [newTokenHash, expiresAt, userId]
    );

    // 6. Return new tokens
    const response = NextResponse.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

    // Set refresh token cookie
    response.cookies.set({
      name: 'refresh_token',
      value: newRefreshToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    console.error('Refresh token error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
