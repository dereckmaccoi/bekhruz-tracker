import { Router } from 'express';
import { query } from '../lib/db.js';
import { sendToAll } from '../bot.js';

// In-memory cooldown: prevents duplicate alerts for the same metric within 2 hours
const alertCooldowns = new Map();
const ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000;

const router = Router();

async function triggerSmartAlerts(metric_id, period_id) {
  try {
    // Resolve project for this metric
    const { rows: [metric] } = await query(
      'SELECT project_id FROM metrics WHERE id = $1', [metric_id]
    );
    if (!metric) return;

    const { rows: [period] } = await query(
      'SELECT * FROM periods WHERE id = $1', [period_id]
    );
    if (!period) return;

    const { rows: [project] } = await query(
      'SELECT name FROM projects WHERE id = $1', [metric.project_id]
    );

    // Get all metrics for this project with pace data
    const { rows: metrics } = await query(
      'SELECT * FROM metrics WHERE project_id = $1', [metric.project_id]
    );
    if (!metrics.length) return;

    const metricIds = metrics.map(m => `'${m.id}'`).join(',');
    const [{ rows: targets }, { rows: entrySums }] = await Promise.all([
      query(
        `SELECT * FROM targets WHERE period_id = $1 AND metric_id IN (${metricIds})`,
        [period_id]
      ),
      query(
        `SELECT metric_id, SUM(value)::numeric AS actual
         FROM daily_entries WHERE period_id = $1 AND metric_id IN (${metricIds})
         GROUP BY metric_id`,
        [period_id]
      ),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start     = new Date(period.start_date);
    const end       = new Date(period.end_date);
    const clamped   = today > end ? end : today < start ? start : today;
    const elapsed   = Math.max(1, Math.round((clamped - start) / 86400000) + 1);
    const remaining = Math.max(0, Math.ceil((end - today) / 86400000));

    for (const m of metrics) {
      if (m.is_inverse) continue;
      const target = targets.find(t => t.metric_id === m.id);
      if (!target) continue;
      const entry   = entrySums.find(e => e.metric_id === m.id);
      const actual  = parseFloat(entry?.actual || 0);
      const weekly  = parseFloat(target.weekly_target);
      if (!weekly) continue;

      const expected = Math.round((elapsed / period.days) * weekly);
      if (!expected) continue;
      const pct = Math.round((actual / expected) * 100);

      if (pct < 70) {
        const cooldownKey = `${metric.project_id}:${m.id}:${period_id}`;
        const lastSent    = alertCooldowns.get(cooldownKey) || 0;
        if (Date.now() - lastSent >= ALERT_COOLDOWN_MS) {
          alertCooldowns.set(cooldownKey, Date.now());
          const needPerDay = remaining > 0
            ? Math.ceil((weekly - actual) / remaining)
            : null;
          const line2 = needPerDay !== null
            ? `Need ${needPerDay}/day for ${remaining} days to hit target`
            : 'Period has ended';
          sendToAll(
            `⚠️ ${project.name} · ${m.name} dropped to ${pct}% pace\n${line2}`
          ).catch(e => console.error('Smart alert send error:', e.message));
        }
      }
    }
  } catch (e) {
    console.error('triggerSmartAlerts error:', e.message);
  }
}

router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT * FROM daily_entries WHERE 1=1';
    const params = [];
    if (req.query.period_id)  { params.push(req.query.period_id);  sql += ` AND period_id=$${params.length}`; }
    if (req.query.metric_id)  { params.push(req.query.metric_id);  sql += ` AND metric_id=$${params.length}`; }
    if (req.query.date)       { params.push(req.query.date);       sql += ` AND date=$${params.length}`; }
    if (req.query.start_date) { params.push(req.query.start_date); sql += ` AND date>=$${params.length}`; }
    if (req.query.end_date)   { params.push(req.query.end_date);   sql += ` AND date<=$${params.length}`; }
    sql += ' ORDER BY date';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { metric_id, period_id, date, value } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO daily_entries (metric_id, period_id, date, value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (metric_id, date)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING *`,
      [metric_id, period_id, date, value]
    );
    res.json(rows[0]);

    // Fire-and-forget: smart alerts don't block the response
    triggerSmartAlerts(metric_id, period_id);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/yesterday', async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT * FROM daily_entries WHERE date = CURRENT_DATE - INTERVAL '1 day'"
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
