import { Router } from 'express';
import { query } from '../lib/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM projects ORDER BY sort_order');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { id, name, color, sort_order } = req.body;
  try {
    const { rows } = await query(
      'INSERT INTO projects (id, name, color, sort_order) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, name, color, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  const { name, color, sort_order } = req.body;
  try {
    const { rows } = await query(
      'UPDATE projects SET name=$1, color=$2, sort_order=$3 WHERE id=$4 RETURNING *',
      [name, color, sort_order, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  try {
    // Delete in strict dependency order to avoid FK violations regardless of
    // whether CASCADE is configured on the live DB.

    // 1. Entries — reference both metrics and periods
    await query(`
      DELETE FROM daily_entries
      WHERE metric_id IN (SELECT id FROM metrics WHERE project_id = $1)
         OR period_id  IN (SELECT id FROM periods  WHERE project_id = $1)
    `, [id]);

    // 2. Targets — reference both metrics and periods
    await query(`DELETE FROM targets WHERE metric_id IN (SELECT id FROM metrics WHERE project_id = $1)`, [id]);
    await query(`DELETE FROM targets WHERE period_id  IN (SELECT id FROM periods  WHERE project_id = $1)`, [id]);

    // 3. Metrics
    await query(`DELETE FROM metrics WHERE project_id = $1`, [id]);

    // 4. Sub-periods first (parent_id FK), then parent periods
    await query(`DELETE FROM periods WHERE parent_id IN (SELECT id FROM periods WHERE project_id = $1)`, [id]);
    await query(`DELETE FROM periods WHERE project_id = $1`, [id]);

    // 5. Nullify project reference in hypotheses (kept as history)
    await query(`UPDATE hypotheses SET project_id = NULL WHERE project_id = $1`, [id]);

    // 6. Finally remove the project row
    await query(`DELETE FROM projects WHERE id = $1`, [id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
