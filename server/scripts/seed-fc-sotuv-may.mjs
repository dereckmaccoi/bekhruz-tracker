/**
 * Seeds Full Contact Sotuv daily entries for May 1–25 2026.
 * Run: DATABASE_URL=<your-railway-url> node server/scripts/seed-fc-sotuv-may.mjs
 * Or:  add DATABASE_URL to server/.env and just run: node server/scripts/seed-fc-sotuv-may.mjs
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(__dir, '../.env'), 'utf8');
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
  });
} catch {}

const { Pool } = pg;
const pool = new Pool(
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

// Periods: h1_may26 (1-7), h2_may26 (8-15), h3_may26 (16-21), h4_may26 (22-31)
const ENTRIES = [
  ['2026-05-01', 'h1_may26',  9],
  ['2026-05-02', 'h1_may26', 13],
  ['2026-05-03', 'h1_may26',  6],
  ['2026-05-04', 'h1_may26', 15],
  ['2026-05-05', 'h1_may26', 13],
  ['2026-05-06', 'h1_may26', 13],
  ['2026-05-07', 'h1_may26',  6],
  ['2026-05-08', 'h2_may26',  7],
  ['2026-05-09', 'h2_may26',  4],
  ['2026-05-10', 'h2_may26',  2],
  ['2026-05-11', 'h2_may26',  6],
  ['2026-05-12', 'h2_may26',  4],
  ['2026-05-13', 'h2_may26',  5],
  ['2026-05-14', 'h2_may26', 14],
  ['2026-05-15', 'h2_may26',  5],
  ['2026-05-16', 'h3_may26',  3],
  ['2026-05-17', 'h3_may26',  2],
  ['2026-05-18', 'h3_may26', 15],
  ['2026-05-19', 'h3_may26',  8],
  ['2026-05-20', 'h3_may26',  5],
  ['2026-05-21', 'h3_may26', 15],
  ['2026-05-22', 'h4_may26', 10],
  ['2026-05-23', 'h4_may26',  3],
  ['2026-05-24', 'h4_may26',  4],
  ['2026-05-25', 'h4_may26', 16],
];

async function run() {
  const client = await pool.connect();
  try {
    let total = 0;
    for (const [date, period_id, value] of ENTRIES) {
      const { rows } = await client.query(
        `INSERT INTO daily_entries (metric_id, period_id, date, value)
         VALUES ('fc_sotuv', $1, $2, $3)
         ON CONFLICT (metric_id, date) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING value`,
        [period_id, date, value]
      );
      total += rows[0].value;
      console.log(`  ✓  ${date}  ${value}`);
    }
    console.log(`\n✅ Done — ${ENTRIES.length} entries, total = ${total}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
