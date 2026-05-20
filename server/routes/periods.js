import { Router } from 'express';
import { query } from '../lib/db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    let sql;
    const params = [];
    if (req.query.project_id) {
      params.push(req.query.project_id);
      sql = `SELECT * FROM periods WHERE (project_id=$1 OR project_id IS NULL) ORDER BY start_date`;
    } else {
      sql = 'SELECT * FROM periods ORDER BY start_date';
    }
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { id, name, start_date, end_date, project_id, parent_id } = req.body;
  try {
    const { rows } = await query(
      'INSERT INTO periods (id, name, start_date, end_date, project_id, parent_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [id, name, start_date, end_date, project_id || null, parent_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  const { name, start_date, end_date, parent_id } = req.body;
  try {
    const { rows } = await query(
      'UPDATE periods SET name=$1, start_date=$2, end_date=$3, parent_id=$4 WHERE id=$5 RETURNING *',
      [name, start_date, end_date, parent_id ?? null, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM periods WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
