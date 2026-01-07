// lib/db.ts
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

// Optimized connection pool configuration for better performance
export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // required for production (Supabase / Render / Neon)
  },
  // Connection pool optimization
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Optimized query function with better error handling
export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } catch (error) {
    // Log error for debugging but don't expose sensitive details
    console.error('Database query error:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  } finally {
    client.release();
  }
}
