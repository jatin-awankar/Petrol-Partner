// lib/db.ts
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // required for production (Supabase / Render / Neon)
  },
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}
