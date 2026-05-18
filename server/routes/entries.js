import { Router } from 'express';
import { query } from '../lib/db.js';

const router = Router();

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
