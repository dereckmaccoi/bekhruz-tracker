import { Router } from 'express';
import { query } from '../lib/db.js';

const router = Router();

// GET /api/hypotheses — list all, optional ?project_id= and ?status=
router.get('/', async (req, res) => {
  const { project_id, status } = req.query;
  try {
    const conditions = [];
    const values = [];
    if (project_id) { conditions.push(`project_id = $${values.length + 1}`); values.push(project_id); }
    if (status)     { conditions.push(`status = $${values.length + 1}`);     values.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT * FROM hypotheses ${where} ORDER BY created_at DESC`,
      values
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/hypotheses — create
router.post('/', async (req, res) => {
  const {
    project_id, hypothesis, point_a, point_b,
    action_deadline, insight_deadline, responsible,
    result, idea_score, success, status, insight, campaign_context,
  } = req.body;
  if (!hypothesis) return res.status(400).json({ error: 'hypothesis is required' });
  try {
    const { rows } = await query(
      `INSERT INTO hypotheses
        (project_id, hypothesis, point_a, point_b, action_deadline, insight_deadline,
         responsible, result, idea_score, success, status, insight, campaign_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        project_id ?? null, hypothesis, point_a ?? null, point_b ?? null,
        action_deadline ?? null, insight_deadline ?? null, responsible ?? null,
        result ?? null, idea_score ?? null, success ?? null,
        status ?? 'not_started', insight ?? null, campaign_context ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/hypotheses/:id — update
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [
    'project_id','hypothesis','point_a','point_b',
    'action_deadline','insight_deadline','responsible',
    'result','idea_score','success','status','insight','campaign_context',
  ];
  const updates = [];
  const values = [];
  fields.forEach(f => {
    if (Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates.push(`${f} = $${values.length + 1}`);
      values.push(req.body[f]);
    }
  });
  if (!updates.length) return res.status(400).json({ error: 'no fields to update' });
  updates.push(`updated_at = NOW()`);
  values.push(id);
  try {
    const { rows } = await query(
      `UPDATE hypotheses SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/hypotheses/:id
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM hypotheses WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
