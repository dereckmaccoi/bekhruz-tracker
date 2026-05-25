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
    // Run everything in a single transaction so any failure is atomic and visible
    await query('BEGIN');

    // 1. Entries (reference metrics and periods)
    await query(`
      DELETE FROM daily_entries
      WHERE metric_id IN (SELECT id FROM metrics WHERE project_id = $1)
         OR period_id  IN (SELECT id FROM periods  WHERE project_id = $1)
    `, [id]);

    // 2. Targets via metrics
    await query(`DELETE FROM targets WHERE metric_id IN (SELECT id FROM metrics WHERE project_id = $1)`, [id]);

    // 3. Targets via periods
    await query(`DELETE FROM targets WHERE period_id IN (SELECT id FROM periods WHERE project_id = $1)`, [id]);

    // 4. Metrics
    await query(`DELETE FROM metrics WHERE project_id = $1`, [id]);

    // 5. Sub-periods (child → parent FK must be removed first)
    await query(`DELETE FROM periods WHERE parent_id IN (SELECT id FROM periods WHERE project_id = $1)`, [id]);

    // 6. Parent periods
    await query(`DELETE FROM periods WHERE project_id = $1`, [id]);

    // 7. Hypotheses — keep rows but clear the project reference
    await query(`UPDATE hypotheses SET project_id = NULL WHERE project_id = $1`, [id]);

    // 8. Project row
    await query(`DELETE FROM projects WHERE id = $1`, [id]);

    await query('COMMIT');
    res.status(204).end();
  } catch (e) {
    await query('ROLLBACK').catch(() => {});
    console.error('Project delete failed for id=%s: %s', id, e.message);
    res.status(500).json({ error: `Delete failed: ${e.message}` });
  }
});

export default router;
