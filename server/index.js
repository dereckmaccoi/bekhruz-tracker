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
import hypothesesRouter from './routes/hypotheses.js';
import { query } from './lib/db.js';
import cron from 'node-cron';
import { telegramAuthMiddleware } from './middleware/telegramAuth.js';
import { setupWebhook, handleUpdate, sendToAll } from './bot.js';
import { computeProjectStatuses, buildStatusMessage } from './lib/notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── DB migrations (idempotent — safe on fresh or existing DB) ────────────────
async function runMigrations() {
  // 1. Base tables ---------------------------------------------------------
  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS periods (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date   DATE NOT NULL,
      days       INTEGER GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // metrics created without a CHECK constraint — we add it after data migration
  await query(`
    CREATE TABLE IF NOT EXISTS metrics (
      id         TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'regular',
      is_inverse BOOLEAN DEFAULT FALSE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS targets (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      metric_id     TEXT REFERENCES metrics(id) ON DELETE CASCADE,
      period_id     TEXT REFERENCES periods(id) ON DELETE CASCADE,
      weekly_target NUMERIC NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(metric_id, period_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS daily_entries (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      metric_id  TEXT REFERENCES metrics(id) ON DELETE CASCADE,
      period_id  TEXT REFERENCES periods(id) ON DELETE CASCADE,
      date       DATE NOT NULL,
      value      NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(metric_id, date)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hypotheses (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id       TEXT REFERENCES projects(id) ON DELETE SET NULL,
      hypothesis       TEXT NOT NULL,
      point_a          TEXT,
      point_b          TEXT,
      action_deadline  DATE,
      insight_deadline DATE,
      responsible      TEXT,
      result           TEXT,
      idea_score       INTEGER,
      success          BOOLEAN,
      status           TEXT NOT NULL DEFAULT 'not_started',
      insight          TEXT,
      campaign_context TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // 2. Schema evolution for existing DBs -----------------------------------
  await query(`ALTER TABLE periods ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE periods ADD COLUMN IF NOT EXISTS parent_id  TEXT REFERENCES periods(id)  ON DELETE CASCADE`);
  await query(`ALTER TABLE metrics ADD COLUMN IF NOT EXISTS is_inverse BOOLEAN DEFAULT FALSE`);

  // 3. Drop old type CHECK constraint (auto-named 'metrics_type_check' by PG)
  await query(`ALTER TABLE metrics DROP CONSTRAINT IF EXISTS metrics_type_check`);

  // 4. Normalise old type values (daily/weekly → regular, inverse → regular + flag)
  await query(`UPDATE metrics SET is_inverse = TRUE WHERE type = 'inverse'`);
  await query(`UPDATE metrics SET type = 'regular' WHERE type IN ('daily', 'weekly', 'inverse')`);

  // 5. Add new CHECK constraint (idempotent — exception-safe)
  await query(`
    DO $$ BEGIN
      ALTER TABLE metrics ADD CONSTRAINT metrics_type_valid
        CHECK (type IN ('regular', 'campaign'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  // 6. Indexes -------------------------------------------------------------
  await query(`CREATE INDEX IF NOT EXISTS idx_periods_parent       ON periods(parent_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_metrics_project      ON metrics(project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_targets_metric_period ON targets(metric_id, period_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_entries_metric_date  ON daily_entries(metric_id, date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_entries_period       ON daily_entries(period_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_hypotheses_project ON hypotheses(project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_hypotheses_status  ON hypotheses(status)`);

  // 7. Seed initial data if the DB is empty --------------------------------
  const { rows } = await query(`SELECT COUNT(*) AS count FROM projects`);
  if (parseInt(rows[0].count, 10) === 0) {
    await seedInitialData();
    console.log('Seeded initial projects, periods, metrics and targets.');
  }

  // 8. Seed HADI hypotheses — only when SEED_HADI=true env var is set ------
  if (process.env.SEED_HADI === 'true') {
    const { rows: hRows } = await query(`SELECT COUNT(*) AS count FROM hypotheses`);
    if (parseInt(hRows[0].count, 10) === 0) {
      await seedHadiData();
      console.log('Seeded 16 HADI hypotheses from Page №1.');
    } else {
      console.log(`SEED_HADI=true but ${hRows[0].count} hypotheses already exist — skipping.`);
    }
  }

  // 9. Seed FC Sotuv daily entries for May 2026 — triggered by SEED_FC_MAY=true
  if (process.env.SEED_FC_MAY === 'true') {
    await seedFcSotuvMay();
    console.log('Seeded Full Contact Sotuv entries for May 1–25 2026.');
  }
}

async function seedInitialData() {
  await query(`
    INSERT INTO projects (id, name, color, sort_order) VALUES
      ('tsb', 'TSB',           '#E24B4A', 1),
      ('fc',  'Full Contact',  '#1D9E75', 2),
      ('mc',  'Milliard Club', '#7F77DD', 3),
      ('sd',  'Sales Doctor',  '#BA7517', 4)
    ON CONFLICT (id) DO NOTHING
  `);

  await query(`
    INSERT INTO periods (id, name, start_date, end_date) VALUES
      ('h1_may26', 'H1', '2026-05-01', '2026-05-07'),
      ('h2_may26', 'H2', '2026-05-08', '2026-05-15'),
      ('h3_may26', 'H3', '2026-05-16', '2026-05-21'),
      ('h4_may26', 'H4', '2026-05-22', '2026-05-31')
    ON CONFLICT (id) DO NOTHING
  `);

  await query(`
    INSERT INTO metrics (id, project_id, name, type, is_inverse, sort_order) VALUES
      ('tsb_sotuv',    'tsb', 'Sotuv',     'regular', false, 1),
      ('tsb_leads',    'tsb', 'Leads',     'regular', false, 2),
      ('fc_sotuv',     'fc',  'Sotuv',     'regular', false, 1),
      ('fc_leads',     'fc',  'Leads',     'regular', false, 2),
      ('fc_retention', 'fc',  'Retention', 'regular', false, 3),
      ('fc_churn',     'fc',  'Churn',     'regular', true,  4),
      ('mc_reach',     'mc',  'Reach',     'regular', false, 1),
      ('mc_leads',     'mc',  'Leads',     'regular', false, 2),
      ('mc_sotuv',     'mc',  'Sotuv',     'regular', false, 3),
      ('sd_reach',     'sd',  'Reach',     'regular', false, 1),
      ('sd_leads',     'sd',  'Leads',     'regular', false, 2),
      ('sd_sotuv',     'sd',  'Sotuv',     'regular', false, 3)
    ON CONFLICT (id) DO NOTHING
  `);

  // H1 targets
  const h1Targets = [
    ['tsb_sotuv',    63],     ['tsb_leads',    120],
    ['fc_sotuv',     100],    ['fc_leads',     1000],
    ['fc_retention', 25000000],['fc_churn',    40],
    ['mc_reach',     715000], ['mc_leads',     360],
    ['mc_sotuv',     14],     ['sd_reach',     2000000],
    ['sd_leads',     1667],   ['sd_sotuv',     6],
  ];
  for (const [metric_id, weekly_target] of h1Targets) {
    await query(
      `INSERT INTO targets (metric_id, period_id, weekly_target)
       VALUES ($1, 'h1_may26', $2) ON CONFLICT (metric_id, period_id) DO NOTHING`,
      [metric_id, weekly_target]
    );
  }

  // Copy H1 targets to H2, H3, H4
  for (const period_id of ['h2_may26', 'h3_may26', 'h4_may26']) {
    await query(
      `INSERT INTO targets (metric_id, period_id, weekly_target)
       SELECT metric_id, $1, weekly_target FROM targets WHERE period_id = 'h1_may26'
       ON CONFLICT (metric_id, period_id) DO NOTHING`,
      [period_id]
    );
  }
}

async function seedHadiData() {
  // 16 hypotheses extracted from Google Sheets Page №1
  // Fields: [project_id, hypothesis, point_a, point_b, action_deadline,
  //          insight_deadline, result, idea_score, success, status, insight, campaign_context]
  const data = [
    ['fc', "Agar Random Coffee'da Milliard'dan ham qatnashishyapti deb aytsam, 100 ta odam qatnashadi",
      '78', '100', null, null, '52', 20, false, 'done',
      "Juda kech eslatdik, agar oldinroq progrevni boshlaganimizda o'xshagan bo'lar edi", null],

    ['fc', "Saytga pul ko'proq sarflansa, sotuv oshadi",
      'kuniga $45', 'kuniga $150', null, null, null, 25, false, 'done',
      "CAC/CPL ko'tarilip ketti 2x ga va bitta raqam baribir o'zgarmadi", null],

    ['sd', 'Qayta sotuvni oshirish uchun dastur guruhlarga video yuborish',
      null, null, null, null, '0 sotuv', 27, false, 'done',
      'Umuman ishlamadi, juda sanoqli kishi qiziqish bildirgan', null],

    ['fc', "Agar liddan sotuv CVR 10% konstanta bo'lsa, 250 ta sotuv uchun 2500 ta lid beraman",
      '1500 ta lid oyiga', '2500 ta lid oyiga', null, null, null, 20, null, 'not_started',
      null, null],

    ['fc', 'Glossary berish bir oydagilarga',
      null, null, '2026-03-29', '2026-03-30', 'Positive feedback', 25, false, 'done',
      "Gave glossary to those who asked. They were grateful. Result is not shocking but ok.",
      "Churn'ni 20% dan 15% ga tushurish"],

    ['fc', "Kelajakdagi mavzular qanday bo'lishini obunachilarning o'zidan so'rash",
      null, null, null, null, null, 25, null, 'in_progress',
      null, "Churn'ni 20% dan 15% ga tushurish"],

    ['fc', 'VSL orqali sotish',
      '0 ta sotuv', '50 ta sotuv', '2026-04-19', '2026-04-20',
      "85 ta lid, 7 sotib oldi (8%)", 25, true, 'done',
      "85 ta lid: 7 sotib oldi (8%), 30 sifatsiz (35%), 21 tadbirkor. CVR o'rtacha — norma 10%. Sotuv hajmi maqsadga yetmadi, lekin CVR tasdiqlandi. O'rtacha natija.",
      'Martda 250 ta yangi obunachi'],

    ['fc', "Saytga ko'proq urg'u berish",
      'kuniga $45', 'kuniga $150', '2026-03-22', '2026-03-23', null, 21, false, 'done',
      "CAC / CPL ko'tarilip ketti 2x ga va bitta raqam baribir o'zgarmadi - CTR - 10% ga qolip ketti",
      'Martda 250 ta yangi obunachi'],

    ['sd', 'Raqamga target yoqish',
      "kuniga $10 ads spent", "kuniga $100 agar o'zini oqlasa", '2026-03-15', '2026-03-23',
      '76 ta liddan 22 tasi sifatli', 30, true, 'done',
      "76 ta lid keldi: 22 sifatli (29%), 5 zayavka, 5 start. Natija o'rtacha — raqamga target ishladi, lekin konversiya past",
      'Mart oxirigacha $110 000 sotuv'],

    ['sd', 'Qiymat tanilishiga target yoqish',
      '$0 ad spent daily', '$15 ad spent daily', '2026-03-31', '2026-04-12',
      null, 20, null, 'in_progress',
      "Mavzu: Mart oxirigacha \$110 000 sotuv  |  26.03.2026",
      'Mart oxirigacha $110 000 sotuv'],

    ['fc', `"Full Contact" - Alisher Isaev bilan bevosita kontakt nomli kampaniya yoqish va Ustoz full contact'da savolga javob berayotganlarini rasmda ko'rsatish`,
      '0 ta lid', '10 ta lid', '2026-04-01', '2026-04-01', '0 ta lid', 25, false, 'done',
      'Ishlamadi rasm format',
      'Mart oxirigacha $110 000 sotuv'],

    ['sd', 'Ustoz bilan VSL olish va bu orqali sotuvni amalga oshirish',
      '0 ta sotuv', '10 ta sotuv', '2026-03-31', '2026-05-15',
      null, 25, null, 'not_started',
      "Mavzu: Mart oxirigacha \$110 000 sotuv  |  26.03.2026",
      "100.000 bazani bitta joyga yig'ish"],

    ['sd', "FC'dan 15k, SD'dan 25k bazani yig'ish",
      '0k baza', '1k baza', '2026-03-31', '2026-05-15',
      null, 25, null, 'in_progress',
      "Mavzu: 100.000 bazani bitta joyga yig'ish  |  26.03.2026",
      'Aprelda 250 ta yangi obunachi'],

    ['fc', 'Full Contact reklamasi Sales Doctor akkauntida ishga tushirilsa, sifatli lidlar va sotuvlar keladi',
      "0 ta sotuv (SD akkauntida FC reklama yo'q edi)", 'Sifatli lidlar va sotuvlar',
      '2026-04-19', '2026-04-20', "81 ta lid, 20 sotib oldi (25%)", 25, true, 'done',
      "81 ta lid: 20 sotib oldi (25%), 12 yangi lid, 12 aloqa o'rnatilindi. Natija juda kuchli — SD akkauntida FC reklama ishlaydi",
      'Aprelda 250 ta yangi obunachi'],

    ['sd', 'Sales Doctor reklamasi Milliard akkauntida ishga tushirilsa, sifatli lidlar va sotuvlar keladi',
      "0 ta sotuv (Milliard akkauntida SD reklama yo'q edi)", 'Sifatli lidlar va sotuvlar',
      '2026-04-26', '2026-04-27', null, 25, null, 'in_progress',
      "\$200,000 sotuv — 23-dastur  |  20.04.2026",
      '$200,000 sotuv — 23-dastur'],

    ['fc', "Barcha sotb olgan obunachi ro'yxatidan LAL yaratib Meta adsda yangi auditoriyaga reklama berish",
      'CAC = $22, keng targeting ishlatilmoqda', 'CAC ni $15 gacha tushirish, 250 yangi obunachi qo\'shish',
      '2026-04-25', '2026-05-02', null, 25, null, 'not_started',
      "Mavzu: Mayda 250 ta yangi obunachi  |  24.04.2026",
      'Mayda 250 ta yangi obunachi'],
  ];

  for (const [pid, hyp, pa, pb, ad, id, result, score, succ, status, insight, campaign] of data) {
    await query(
      `INSERT INTO hypotheses
         (project_id, hypothesis, point_a, point_b, action_deadline, insight_deadline,
          responsible, result, idea_score, success, status, insight, campaign_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [pid, hyp, pa, pb, ad, id, 'Bekhruz Rustamjanov',
       result, score, succ, status, insight, campaign]
    );
  }
}

async function seedFcSotuvMay() {
  // Full Contact — Sotuv daily entries, May 1–25 2026
  // Periods: h1_may26 (1-7), h2_may26 (8-15), h3_may26 (16-21), h4_may26 (22-31)
  const entries = [
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
  for (const [date, period_id, value] of entries) {
    await query(
      `INSERT INTO daily_entries (metric_id, period_id, date, value)
       VALUES ('fc_sotuv', $1, $2, $3)
       ON CONFLICT (metric_id, date) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [period_id, date, value]
    );
  }
}

runMigrations().catch(e => console.error('Migration error:', e.message));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Telegram auth ─────────────────────────────────────────────────────────────
// Health check — exempt from auth so Railway can verify the deployment
app.get('/api/health', (_, res) => res.json({ ok: true }));

// Validate endpoint — lightweight ping to confirm initData is accepted
app.post('/api/auth/validate', telegramAuthMiddleware, (req, res) => {
  res.json({ ok: true, user: req.telegramUser });
});

// Apply auth middleware to all other /api routes
app.use('/api', telegramAuthMiddleware);

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/projects', projectsRouter);
app.use('/api/periods', periodsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/targets', targetsRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/hypotheses', hypothesesRouter);
app.use('/api/project', dashboardRouter);

// ── Telegram bot webhook ──────────────────────────────────────────────────────
app.post('/bot/webhook', (req, res) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret || req.query.secret !== expectedSecret) {
    return res.status(403).json({ error: 'forbidden' });
  }
  handleUpdate(req.body);
  res.sendStatus(200);
});

// ── Serve React build (production) ───────────────────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (_, res) => res.sendFile(path.join(clientDist, 'index.html')));

// ── Listen on all interfaces (required for Railway / containers) ──────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Bekhruz Tracker running on port ${PORT}`);

  // Register Telegram webhook after server is listening
  await setupWebhook();

  // ── Cron: Morning summary — 9:00 AM Tashkent (04:00 UTC) ───────────────
  cron.schedule('0 4 * * *', async () => {
    try {
      const statuses = await computeProjectStatuses();
      const msg      = buildStatusMessage(statuses);
      const allOk    = statuses.every(s => s.avgPace === null || s.avgPace >= 70);
      await sendToAll(msg + (allOk ? '\n\n🟢 All on track' : ''));
    } catch (e) {
      console.error('Morning cron error:', e.message);
    }
  });

  // ── Cron: Afternoon nudge — 3:00 PM Tashkent (10:00 UTC) ───────────────
  cron.schedule('0 10 * * *', async () => {
    try {
      const today              = new Date().toISOString().slice(0, 10);
      const { rows: projects } = await query('SELECT id FROM projects');
      const { rows: entered  } = await query(
        `SELECT DISTINCT m.project_id
         FROM daily_entries e
         JOIN metrics m ON m.id = e.metric_id
         WHERE e.date = $1`,
        [today]
      );
      const enteredIds = new Set(entered.map(r => r.project_id));
      const hasGap     = projects.some(p => !enteredIds.has(p.id));

      if (hasGap) {
        await sendToAll("⏰ Don't forget to log today's numbers", {
          reply_markup: {
            inline_keyboard: [[
              { text: '📊 Open Tracker', web_app: { url: process.env.BASE_URL } },
            ]],
          },
        });
      }
    } catch (e) {
      console.error('Afternoon cron error:', e.message);
    }
  });
});
