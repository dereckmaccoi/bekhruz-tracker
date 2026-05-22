import { query } from './db.js';

// Port of frontend daysElapsed — clamped to period bounds
function daysElapsed(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(period.start_date);
  const end   = new Date(period.end_date);
  const clamped = today > end ? end : today < start ? start : today;
  return Math.max(1, Math.round((clamped - start) / 86400000) + 1);
}

// Port of frontend pacePercent
function pacePercent(actual, weeklyTarget, period, isInverse) {
  const elapsed   = daysElapsed(period);
  const expected  = Math.round((elapsed / period.days) * weeklyTarget);
  if (!expected) return null;
  if (isInverse && !actual) return null;
  return isInverse
    ? Math.round((expected / actual) * 100)
    : Math.round((actual / expected) * 100);
}

// Port of frontend detectActivePeriod — prefers child periods (week inside campaign)
function detectActivePeriod(periods) {
  if (!periods || periods.length === 0) return null;
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
  return past.length > 0 ? past[past.length - 1] : periods[0];
}

/**
 * For each project: find active period, sum entries, compute pacePercent per metric.
 * Returns array of { projectId, projectName, avgPace, metricPaces, catchupAlerts }.
 */
export async function computeProjectStatuses() {
  const today = new Date().toISOString().slice(0, 10);
  const { rows: projects } = await query('SELECT * FROM projects ORDER BY sort_order');
  const results = [];

  for (const project of projects) {
    // Periods for this project (own + global/unassigned)
    const { rows: periods } = await query(
      `SELECT * FROM periods
       WHERE (project_id = $1 OR project_id IS NULL)
       ORDER BY start_date`,
      [project.id]
    );

    const period = detectActivePeriod(periods);
    if (!period) continue;

    const { rows: metrics } = await query(
      'SELECT * FROM metrics WHERE project_id = $1 ORDER BY sort_order',
      [project.id]
    );
    if (metrics.length === 0) continue;

    const metricIds = metrics.map(m => `'${m.id}'`).join(',');

    const [{ rows: targets }, { rows: entrySums }] = await Promise.all([
      query(
        `SELECT * FROM targets WHERE period_id = $1 AND metric_id IN (${metricIds})`,
        [period.id]
      ),
      query(
        `SELECT metric_id, SUM(value)::numeric AS actual
         FROM daily_entries
         WHERE period_id = $1 AND metric_id IN (${metricIds})
         GROUP BY metric_id`,
        [period.id]
      ),
    ]);

    const endDate   = String(period.end_date).slice(0, 10);
    const remaining = Math.max(0, Math.ceil((new Date(endDate) - new Date(today)) / 86400000));

    const metricPaces = metrics.map(m => {
      const target  = targets.find(t => t.metric_id === m.id);
      const entry   = entrySums.find(e => e.metric_id === m.id);
      const actual  = parseFloat(entry?.actual || 0);
      const weekly  = parseFloat(target?.weekly_target || 0);
      const pct     = weekly > 0 ? pacePercent(actual, weekly, period, m.is_inverse) : null;
      return { id: m.id, name: m.name, is_inverse: m.is_inverse, actual, weekly, pacePercent: pct };
    });

    const valid    = metricPaces.filter(m => m.pacePercent !== null);
    const avgPace  = valid.length > 0
      ? Math.round(valid.reduce((s, m) => s + m.pacePercent, 0) / valid.length)
      : null;

    const catchupAlerts = metricPaces
      .filter(m => !m.is_inverse && m.pacePercent !== null && m.pacePercent < 70
        && remaining > 0 && m.weekly > m.actual)
      .map(m => ({
        metricName:    m.name,
        needPerDay:    Math.ceil((m.weekly - m.actual) / remaining),
        remainingDays: remaining,
      }));

    results.push({ projectId: project.id, projectName: project.name, avgPace, metricPaces, catchupAlerts });
  }

  return results;
}

/**
 * Formats computeProjectStatuses() output into a Telegram message string.
 */
export function buildStatusMessage(statuses) {
  const today   = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'short' });
  const dateStr = today.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

  let msg = `📊 Status — ${dayName} ${dateStr}\n\n`;

  for (const s of statuses) {
    if (s.avgPace === null) continue;
    const icon = s.avgPace >= 70 ? '✅' : '⚠️';
    msg += `${s.projectName.padEnd(14)}${s.avgPace}% ${icon}\n`;
  }

  const alerts = statuses.flatMap(s =>
    s.catchupAlerts.map(a =>
      `⚠️ ${s.projectName} · ${a.metricName} — need ${a.needPerDay}/day for ${a.remainingDays} days`
    )
  );

  if (alerts.length > 0) {
    msg += '\n' + alerts.join('\n');
  }

  return msg.trim();
}
