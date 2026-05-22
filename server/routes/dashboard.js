import { Router } from 'express';
import { query } from '../lib/db.js';

const router = Router();

// Active-period detection — mirrors client-side detectActivePeriod logic
function detectActive(periods) {
  if (!periods.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const activeChild = periods.find(p =>
    p.parent_id &&
    String(p.start_date).slice(0, 10) <= today &&
    String(p.end_date).slice(0, 10) >= today
  );
  if (activeChild) return activeChild;
  const active = periods.find(p =>
    String(p.start_date).slice(0, 10) <= today &&
    String(p.end_date).slice(0, 10) >= today
  );
  if (active) return active;
  const past = periods.filter(p => String(p.end_date).slice(0, 10) < today);
  return past.length > 0 ? past[past.length - 1] : (periods[0] || null);
}

// GET /api/dashboard/summary — all 4 projects in one request (5 DB queries vs 8 HTTP round-trips)
router.get('/summary', async (req, res) => {
  try {
    // Parallel fetch: projects, all periods, all metrics
    const [projectsRes, periodsRes, metricsRes] = await Promise.all([
      query('SELECT * FROM projects ORDER BY sort_order'),
      query('SELECT * FROM periods ORDER BY start_date'),
      query('SELECT * FROM metrics ORDER BY project_id, sort_order'),
    ]);

    const projects  = projectsRes.rows;
    const allPeriods = periodsRes.rows;
    const allMetrics = metricsRes.rows;

    // Per-project: resolve active period and collect all period IDs we need targets for
    const neededPeriodIds = new Set();
    const projData = projects.map(proj => {
      const projPeriods = allPeriods.filter(p => p.project_id === proj.id || !p.project_id);
      const activePeriod = detectActive(projPeriods);
      if (activePeriod) {
        neededPeriodIds.add(activePeriod.id);
        if (activePeriod.parent_id) neededPeriodIds.add(activePeriod.parent_id);
        // Include previous same-level period so client can render delta badge
        const sameLevelPeriods = activePeriod.parent_id
          ? projPeriods.filter(p => p.parent_id === activePeriod.parent_id)
          : projPeriods.filter(p => !p.parent_id);
        const sorted = [...sameLevelPeriods].sort((a, b) =>
          String(a.start_date).localeCompare(String(b.start_date))
        );
        const idx = sorted.findIndex(p => p.id === activePeriod.id);
        if (idx > 0) neededPeriodIds.add(sorted[idx - 1].id);
      }
      return { proj, projPeriods, activePeriod, projMetrics: allMetrics.filter(m => m.project_id === proj.id) };
    });

    const allMetricIds = allMetrics.map(m => m.id);
    const periodIdsArr = [...neededPeriodIds];

    // Parallel fetch: targets for relevant periods + all entries
    const [targetsRes, entriesRes] = await Promise.all([
      periodIdsArr.length
        ? query('SELECT * FROM targets WHERE period_id = ANY($1)', [periodIdsArr])
        : Promise.resolve({ rows: [] }),
      allMetricIds.length
        ? query('SELECT * FROM daily_entries WHERE metric_id = ANY($1) ORDER BY date', [allMetricIds])
        : Promise.resolve({ rows: [] }),
    ]);

    const allTargets = targetsRes.rows;
    const allEntries = entriesRes.rows;

    const result = projData.map(({ proj, projPeriods, activePeriod, projMetrics }) => {
      const metricIds = new Set(projMetrics.map(m => m.id));
      return {
        project: proj,
        period:  activePeriod,
        periods: projPeriods,
        metrics: projMetrics,
        targets: allTargets.filter(t => metricIds.has(t.metric_id)),
        entries: allEntries.filter(e => metricIds.has(e.metric_id)),
      };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
      query('SELECT * FROM periods WHERE (project_id=$1 OR project_id IS NULL) ORDER BY start_date', [id]),
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
