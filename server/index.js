import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import projectsRouter from './routes/projects.js';
import periodsRouter from './routes/periods.js';
import metricsRouter from './routes/metrics.js';
import targetsRouter from './routes/targets.js';
import entriesRouter from './routes/entries.js';
import dashboardRouter from './routes/dashboard.js';
import { query } from './lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── DB migrations (idempotent) ────────────────────────────────────────────────
async function runMigrations() {
  await query(`ALTER TABLE metrics ADD COLUMN IF NOT EXISTS is_inverse BOOLEAN DEFAULT FALSE`);
  await query(`UPDATE metrics SET is_inverse = TRUE, type = 'regular' WHERE type = 'inverse'`);
  // Normalise old type names (requires the check constraint to already allow 'regular')
  try {
    await query(`UPDATE metrics SET type = 'regular' WHERE type IN ('weekly', 'daily')`);
  } catch (_) {
    // Constraint may not yet allow 'regular' — deploy script handles DDL
  }
}
runMigrations().catch(e => console.error('Migration error:', e.message));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/projects', projectsRouter);
app.use('/api/periods', periodsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/targets', targetsRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/project', dashboardRouter);
app.get('/api/health', (_, res) => res.json({ ok: true }));

// ── Serve React build (production) ───────────────────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (_, res) => res.sendFile(path.join(clientDist, 'index.html')));

// ── Listen on all interfaces (required for Railway / containers) ──────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bekhruz Tracker running on port ${PORT}`);
});
