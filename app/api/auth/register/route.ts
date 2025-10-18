import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { query } from '@/lib/db';
import { generateAccessToken, generateRefreshToken } from '@/lib/jwt';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { email, password, full_name, phone } = await req.json();

    // 1. Validate input
    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 2. Check if user already exists
    const existingUser = await query('SELECT * FROM users WHERE email = $1', [email]);
    if ((existingUser?.rowCount ?? 0) > 0) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    // 3. Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 4. Create user
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, phone, created_at`,
      [email, passwordHash, full_name, phone || null]
    );
    const user = result.rows[0];

    // 5. Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // 6. Hash and store refresh token
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        tokenHash,
        req.headers.get('user-agent'),
        req.headers.get('x-forwarded-for') || 'unknown',
        expiresAt,
      ]
    );

    // 7. Return tokens and user info
    const response = NextResponse.json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      },
      accessToken,
      refreshToken,
    });

    // Optional: set HttpOnly cookie for refresh token
    response.cookies.set({
      name: 'refresh_token',
      value: refreshToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
