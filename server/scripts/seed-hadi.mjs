/**
 * One-time HADI seed script — imports 16 hypotheses from Google Sheets Page №1
 * Run: node server/scripts/seed-hadi.mjs
 * Uses DATABASE_URL env var (Railway) or local DB vars from server/.env
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from server/ directory
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

// ── Helpers ──────────────────────────────────────────────────────────────────

// "22.03.2026" → "2026-03-22", "" → null
function parseDate(d) {
  if (!d || !d.trim()) return null;
  const m = d.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

// Uzbek status → DB status
function parseStatus(s) {
  const map = {
    'bajarildi': 'done',
    'boshlanmagan': 'not_started',
    'jarayonda': 'in_progress',
    'davomiy': 'in_progress',
  };
  return map[(s || '').toLowerCase()] || 'not_started';
}

// "Ha" → true, "Yo'q" → false, "" → null
function parseSuccess(s) {
  if (!s || !s.trim()) return null;
  if (s.trim().toLowerCase() === "ha") return true;
  if (s.trim().toLowerCase().startsWith("yo'q") || s.trim().toLowerCase() === "no") return false;
  return null;
}

// Clean placeholder text → null
function cleanText(s) {
  if (!s) return null;
  const placeholders = ["← to'ldiring", "— qo'lda to'ldiring", "— to'g'ridan yozilgan"];
  if (placeholders.some(p => s.trim().startsWith(p) || s.trim().startsWith('←') || s.trim().startsWith('—'))) return null;
  return s.trim() || null;
}

// ── Seed data ─────────────────────────────────────────────────────────────────
// Fields: [project_name, hypothesis, point_a, point_b, action_deadline,
//          insight_deadline, result, idea_score, success, status, insight, campaign_context]
const RAW = [
  ["Full Contact",
   "Agar Random Coffee'da Milliard'dan ham qatnashishyapti deb aytsam, 100 ta odam qatnashadi",
   "78", "100", "", "",
   "52", 20, "Yo'q", "Bajarildi",
   "Juda kech eslatdik, agar oldinroq progrevni boshlaganimizda o'xshagan bo'lar edi", null],

  ["Full Contact",
   "Saytga pul ko'proq sarflansa, sotuv oshadi",
   "kuniga $45", "kuniga $150", "", "",
   "", 25, "Yo'q", "Bajarildi",
   "CAC/CPL ko'tarilip ketti 2x ga va bitta raqam baribir o'zgarmadi", null],

  ["Sales Doctor",
   "Qayta sotuvni oshirish uchun dastur guruhlarga video yuborish",
   "", "", "", "",
   "0 sotuv", 27, "Yo'q", "Bajarildi",
   "Umuman ishlamadi, juda sanoqli kishi qiziqish bildirgan", null],

  ["Full Contact",
   "Agar liddan sotuv CVR 10% konstanta bo'lsa, 250 ta sotuv uchun 2500 ta lid beraman",
   "1500 ta lid oyiga", "2500 ta lid oyiga", "", "",
   "", 20, "", "Boshlanmagan",
   "", null],

  ["Full Contact",
   "Glossary berish bir oydagilarga",
   null, null, "29.03.2026", "30.03.2026",
   "Positive feedback", 25, "Yo'q", "Bajarildi",
   "Gave glossary to those who asked. They were grateful. Result is not shocking but ok.",
   "Churn'ni 20% dan 15% ga tushurish"],

  ["Full Contact",
   "Kelajakdagi mavzular qanday bo'lishini obunachilarning o'zidan so'rash",
   null, null, "", "",
   "", 25, "", "Davomiy",
   "", "Churn'ni 20% dan 15% ga tushurish"],

  ["Full Contact",
   "VSL orqali sotish",
   "0 ta sotuv", "50 ta sotuv", "19.04.2026", "20.04.2026",
   "85 ta lid, 7 sotib oldi (8%)", 25, "Ha", "Bajarildi",
   "85 ta lid: 7 sotib oldi (8%), 30 sifatsiz (35%), 21 tadbirkor. CVR o'rtacha — norma 10%. Sotuv hajmi maqsadga yetmadi, lekin CVR tasdiqlandi. O'rtacha natija.",
   "Martda 250 ta yangi obunachi"],

  ["Full Contact",
   "Saytga ko'proq urg'u berish",
   "kuniga $45", "kuniga $150", "22.03.2026", "23.03.2026",
   "", 21, "Yo'q", "Bajarildi",
   "CAC / CPL ko'tarilip ketti 2x ga va bitta raqam baribir o'zgarmadi - CTR - 10% ga qolip ketti",
   "Martda 250 ta yangi obunachi"],

  ["Sales Doctor",
   "Raqamga target yoqish",
   "kuniga $10 ads spent", "kuniga $100 agar o'zini oqlasa", "15.03.2026", "23.03.2026",
   "76 ta liddan 22 tasi sifatli", 30, "Ha", "Bajarildi",
   "76 ta lid keldi: 22 sifatli (29%), 5 zayavka, 5 start. Natija o'rtacha — raqamga target ishladi, lekin konversiya past",
   "Mart oxirigacha $110 000 sotuv"],

  ["Sales Doctor",
   "Qiymat tanilishiga target yoqish",
   "$0 ad spent daily", "$15 ad spent daily", "31.03.2026", "12.04.2026",
   "", 20, "", "Jarayonda",
   "Mavzu: Mart oxirigacha $110 000 sotuv  |  26.03.2026",
   "Mart oxirigacha $110 000 sotuv"],

  ["Full Contact",
   '"Full Contact" - Alisher Isaev bilan bevosita kontakt nomli kampaniya yoqish va Ustoz full contact\'da savolga javob berayotganlarini rasmda ko\'rsatish',
   "0 ta lid", "10 ta lid", "01.04.2026", "01.04.2026",
   "0 ta lid", 25, "Yo'q", "Bajarildi",
   "Ishlamadi rasm format",
   "Mart oxirigacha $110 000 sotuv"],

  ["Sales Doctor",
   "Ustoz bilan VSL olish va bu orqali sotuvni amalga oshirish",
   "0 ta sotuv", "10 ta sotuv", "31.03.2026", "15.05.2026",
   "", 25, "", "Boshlanmagan",
   "Mavzu: Mart oxirigacha $110 000 sotuv  |  26.03.2026",
   "100.000 bazani bitta joyga yig'ish"],

  ["Sales Doctor",
   "FC'dan 15k, SD'dan 25k bazani yig'ish",
   "0k baza", "1k baza", "31.03.2026", "15.05.2026",
   "", 25, "", "Jarayonda",
   "Mavzu: 100.000 bazani bitta joyga yig'ish  |  26.03.2026",
   "Aprelda 250 ta yangi obunachi"],

  ["Full Contact",
   "Full Contact reklamasi Sales Doctor akkauntida ishga tushirilsa, sifatli lidlar va sotuvlar keladi",
   "0 ta sotuv (SD akkauntida FC reklama yo'q edi)", "Sifatli lidlar va sotuvlar", "19.04.2026", "20.04.2026",
   "81 ta lid, 20 sotib oldi (25%)", 25, "Ha", "Bajarildi",
   "81 ta lid: 20 sotib oldi (25%), 12 yangi lid, 12 aloqa o'rnatilindi. Natija juda kuchli — SD akkauntida FC reklama ishlaydi",
   "Aprelda 250 ta yangi obunachi"],

  ["Sales Doctor",
   "Sales Doctor reklamasi Milliard akkauntida ishga tushirilsa, sifatli lidlar va sotuvlar keladi",
   "0 ta sotuv (Milliard akkauntida SD reklama yo'q edi)", "Sifatli lidlar va sotuvlar", "26.04.2026", "27.04.2026",
   "", 25, "", "Jarayonda",
   "Mavzu: $200,000 sotuv — 23-dastur  |  20.04.2026",
   "$200,000 sotuv — 23-dastur"],

  ["Full Contact",
   "Barcha sotb olgan obunachi ro'yxatidan LAL yaratib Meta adsda yangi auditoriyaga reklama berish",
   "CAC = $22, keng targeting ishlatilmoqda", "CAC ni $15 gacha tushirish, 250 yangi obunachi qo'shish",
   "25.04.2026", "02.05.2026",
   "", 25, "", "Boshlanmagan",
   "Mavzu: Mayda 250 ta yangi obunachi  |  24.04.2026",
   "Mayda 250 ta yangi obunachi"],
];

// ── Run ───────────────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  try {
    // Check if already seeded
    const existing = await client.query('SELECT COUNT(*) FROM hypotheses');
    if (parseInt(existing.rows[0].count) > 0) {
      console.log(`⚠️  hypotheses table already has ${existing.rows[0].count} rows. Skipping seed.`);
      console.log('   Delete existing rows first if you want to re-seed.');
      return;
    }

    // Get project name → id mapping
    const { rows: projects } = await client.query('SELECT id, name FROM projects');
    const projectMap = Object.fromEntries(projects.map(p => [p.name.toLowerCase(), p.id]));
    console.log('Projects found:', Object.keys(projectMap));

    let inserted = 0, skipped = 0;
    for (const row of RAW) {
      const [proj, hyp, pa, pb, ad, id, result, score, succ, status, insight, campaign] = row;
      const project_id = projectMap[proj.toLowerCase()] || null;
      if (!project_id) {
        console.log(`  ⚠️  No project found for "${proj}" — inserting without project_id`);
        skipped++;
      }

      await client.query(
        `INSERT INTO hypotheses
           (project_id, hypothesis, point_a, point_b, action_deadline, insight_deadline,
            responsible, result, idea_score, success, status, insight, campaign_context)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          project_id,
          hyp,
          cleanText(pa),
          cleanText(pb),
          parseDate(ad),
          parseDate(id),
          'Bekhruz Rustamjanov',
          result?.trim() || null,
          score || null,
          parseSuccess(succ),
          parseStatus(status),
          insight?.trim() || null,
          campaign?.trim() || null,
        ]
      );
      inserted++;
      console.log(`  ✓  [${proj}] ${hyp.substring(0, 60)}…`);
    }

    console.log(`\n✅ Done: ${inserted} hypotheses inserted, ${skipped} project mismatches.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('❌ Seed failed:', err.message, err.code, err.stack);
  process.exit(1);
});
