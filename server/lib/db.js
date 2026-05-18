import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// Railway provides DATABASE_URL; fall back to individual vars for local dev
export const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'tracker',
        user:     process.env.DB_USER     || 'tracker',
        password: process.env.DB_PASSWORD,
      }
);

export async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
