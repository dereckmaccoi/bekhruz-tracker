import { Router } from 'express';
import { query } from '../lib/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT * FROM metrics';
    const params = [];
    if (req.query.project_id) {
      sql += ' WHERE project_id = $1';
      params.push(req.query.project_id);
    }
    sql += ' ORDER BY sort_order';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { id, project_id, name, type, is_inverse, sort_order } = req.body;
  try {
    const { rows } = await query(
      'INSERT INTO metrics (id, project_id, name, type, is_inverse, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [id, project_id, name, type ?? 'regular', is_inverse ?? false, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  const { name, type, is_inverse, sort_order } = req.body;
  try {
    const { rows } = await query(
      `UPDATE metrics
       SET name       = COALESCE($1, name),
           type       = COALESCE($2, type),
           is_inverse = COALESCE($3, is_inverse),
           sort_order = COALESCE($4, sort_order)
       WHERE id = $5
       RETURNING *`,
      [name, type, is_inverse, sort_order, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM metrics WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
