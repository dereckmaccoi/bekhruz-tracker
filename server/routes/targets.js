import { Router } from 'express';
import { query } from '../lib/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT t.* FROM targets t JOIN metrics m ON t.metric_id = m.id WHERE 1=1';
    const params = [];
    if (req.query.period_id) {
      params.push(req.query.period_id);
      sql += ` AND t.period_id = $${params.length}`;
    }
    if (req.query.project_id) {
      params.push(req.query.project_id);
      sql += ` AND m.project_id = $${params.length}`;
    }
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { metric_id, period_id, weekly_target } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO targets (metric_id, period_id, weekly_target)
       VALUES ($1, $2, $3)
       ON CONFLICT (metric_id, period_id)
       DO UPDATE SET weekly_target = EXCLUDED.weekly_target, updated_at = NOW()
       RETURNING *`,
      [metric_id, period_id, weekly_target]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/copy', async (req, res) => {
  const { from_period_id, to_period_id } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO targets (metric_id, period_id, weekly_target)
       SELECT metric_id, $1, weekly_target FROM targets WHERE period_id = $2
       ON CONFLICT (metric_id, period_id) DO UPDATE SET weekly_target = EXCLUDED.weekly_target, updated_at = NOW()
       RETURNING *`,
      [to_period_id, from_period_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
