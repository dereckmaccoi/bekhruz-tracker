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
  try {
    await query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
