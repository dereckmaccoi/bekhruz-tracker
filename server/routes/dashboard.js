import { Router } from 'express';
import { query } from '../lib/db.js';

const router = Router();

router.get('/', async (req, res) => {
  const { period_id } = req.query;
  if (!period_id) return res.status(400).json({ error: 'period_id required' });
  try {
    const [projects, period, metrics, targets, entries] = await Promise.all([
      query('SELECT * FROM projects ORDER BY sort_order'),
      query('SELECT * FROM periods WHERE id=$1', [period_id]),
      query('SELECT * FROM metrics ORDER BY sort_order'),
      query('SELECT * FROM targets WHERE period_id=$1', [period_id]),
      query('SELECT * FROM daily_entries WHERE period_id=$1', [period_id]),
    ]);
    res.json({
      projects: projects.rows,
      period: period.rows[0],
      metrics: metrics.rows,
      targets: targets.rows,
      entries: entries.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { period_id } = req.query;
  if (!period_id) return res.status(400).json({ error: 'period_id required' });
  try {
    const [project, metrics, periods] = await Promise.all([
      query('SELECT * FROM projects WHERE id=$1', [id]),
      query('SELECT * FROM metrics WHERE project_id=$1 ORDER BY sort_order', [id]),
      query('SELECT * FROM periods WHERE project_id=$1 ORDER BY start_date', [id]),
    ]);
    const metricIds = metrics.rows.map(m => `'${m.id}'`).join(',');

    // If the requested period is a sub-period week, also fetch the parent
    // campaign's targets so usePace can compute proportional weekly shares.
    const selectedPeriod = periods.rows.find(p => p.id === period_id);
    const parentId = selectedPeriod?.parent_id ?? null;

    const [targets, campaignTargets, entries] = metricIds.length
      ? await Promise.all([
          query(`SELECT * FROM targets WHERE period_id=$1 AND metric_id IN (${metricIds})`, [period_id]),
          parentId
            ? query(`SELECT * FROM targets WHERE period_id=$1 AND metric_id IN (${metricIds})`, [parentId])
            : Promise.resolve({ rows: [] }),
          query(`SELECT * FROM daily_entries WHERE metric_id IN (${metricIds}) ORDER BY date`),
        ])
      : [{ rows: [] }, { rows: [] }, { rows: [] }];

    res.json({
      project: project.rows[0],
      metrics: metrics.rows,
      // Merge week + campaign targets; usePace finds the right row by period_id
      targets: [...targets.rows, ...campaignTargets.rows],
      entries: entries.rows,
      periods: periods.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
