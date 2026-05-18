import { useMemo } from 'react';
import {
  pacePercent,
  expectedByToday,
  dailyTarget,
  colorKey,
  statusLabel,
  formatNum,
  resolveTarget,
} from '../utils/calculations.js';

/**
 * Computes pace stats for all metrics in a given period.
 *
 * @param metrics          - array of metric objects (with .type, .is_inverse)
 * @param targets          - array of target objects (with .metric_id, .period_id, .weekly_target)
 * @param entries          - entries filtered to the current week/period date range
 * @param period           - the current period (week or standalone)
 * @param campaignPeriod   - optional parent campaign period
 * @param campaignEntries  - optional entries for the whole campaign date range
 * @param tab              - 'week' | 'campaign' (default: 'week')
 * @param numSiblingWeeks  - estimated total sub-periods in campaign (for proportional target)
 * @param siblingPeriods   - all sibling sub-periods (used for auto-rollover from completed periods)
 */
export function usePace(
  metrics,
  targets,
  entries,
  period,
  campaignPeriod = null,
  campaignEntries = null,
  tab = 'week',
  numSiblingWeeks = 1,
  siblingPeriods = [],
) {
  return useMemo(() => {
    if (!metrics || !targets || !period) return {};

    // Week-scoped entries summed by metric
    const actualMap = {};
    entries?.forEach(e => {
      actualMap[e.metric_id] = (actualMap[e.metric_id] || 0) + Number(e.value);
    });

    // Campaign-scope entries summed by metric (full campaign duration)
    const campaignActualMap = {};
    campaignEntries?.forEach(e => {
      campaignActualMap[e.metric_id] = (campaignActualMap[e.metric_id] || 0) + Number(e.value);
    });

    const todayStr = new Date().toISOString().slice(0, 10);

    // ── Auto-rollover: actuals from completed sibling sub-periods ─────────────
    // Completed = end_date < today AND not the current period.
    // We sum entries that fall within each completed sibling's date range from
    // the full campaignEntries pool. This lets future sub-periods inherit the
    // shortfall (or surplus) automatically without any manual trigger.
    const completedSiblings = siblingPeriods.filter(p =>
      p.id !== period.id && String(p.end_date).slice(0, 10) < todayStr
    );
    const futureSiblingCount = siblingPeriods.filter(p =>
      String(p.end_date).slice(0, 10) >= todayStr
    ).length || 1;

    // Compute per-metric sum of actuals across completed siblings
    const completedActualsMap = {};
    if (completedSiblings.length > 0 && campaignEntries) {
      completedSiblings.forEach(sib => {
        const s = String(sib.start_date).slice(0, 10);
        const e = String(sib.end_date).slice(0, 10);
        campaignEntries.forEach(entry => {
          const d = String(entry.date).slice(0, 10);
          if (d >= s && d <= e) {
            completedActualsMap[entry.metric_id] =
              (completedActualsMap[entry.metric_id] || 0) + Number(entry.value);
          }
        });
      });
    }

    const result = {};
    metrics.forEach(m => {
      const isCampaign = m.type === 'campaign';
      const isInverse  = !!m.is_inverse;

      // ── Determine weeklyTarget ──────────────────────────────────────────────
      let weeklyTarget;
      if (isCampaign) {
        // Always look up campaign total from the parent campaign period
        const campaignTotalEntry = period.parent_id
          ? targets.find(t => t.period_id === period.parent_id && t.metric_id === m.id)
          : targets.find(t => t.period_id === period.id && t.metric_id === m.id);
        const campaignTotal = campaignTotalEntry?.weekly_target ?? 0;

        if (tab === 'week') {
          // Week-specific manual override
          const weekOverride = targets.find(
            t => t.period_id === period.id && t.metric_id === m.id
          );
          // Guard: stale override = override equals campaignTotal with multiple sub-periods
          const isStaleOverride = weekOverride?.weekly_target != null
            && weekOverride.weekly_target === campaignTotal
            && numSiblingWeeks > 1;

          if (!isStaleOverride && weekOverride?.weekly_target != null) {
            weeklyTarget = weekOverride.weekly_target;
          } else {
            // Auto-rollover formula: remaining budget ÷ future sub-periods
            const completedActuals = completedActualsMap[m.id] || 0;
            const remainingBudget  = Math.max(0, campaignTotal - completedActuals);
            weeklyTarget = Math.ceil(remainingBudget / futureSiblingCount);
          }
        } else {
          // Campaign tab: show full campaign total
          weeklyTarget = campaignTotal;
        }
      } else {
        const target = resolveTarget(targets, m.id, period);
        weeklyTarget = target?.weekly_target || 0;
      }

      // ── Determine effectivePeriod and actual ──────────────────────────────
      const effectivePeriod = (isCampaign && tab === 'campaign' && campaignPeriod)
        ? campaignPeriod
        : period;

      const actual = (isCampaign && tab === 'campaign' && campaignEntries)
        ? (campaignActualMap[m.id] || 0)
        : (actualMap[m.id] || 0);

      // ── Pace calculations ─────────────────────────────────────────────────
      const pct      = pacePercent(actual, weeklyTarget, effectivePeriod, isInverse);
      const expected = expectedByToday(weeklyTarget, effectivePeriod);
      const dt       = dailyTarget(weeklyTarget, effectivePeriod);
      const color    = colorKey(pct, isInverse);
      const status   = statusLabel(pct, isInverse);
      const gap      = actual - expected;
      const isAhead  = isInverse ? gap <= 0 : gap >= 0;
      const gapLabel = isAhead
        ? `+${formatNum(Math.abs(gap))} ahead of today's pace (${formatNum(expected)})`
        : `−${formatNum(Math.abs(gap))} behind today's pace (${formatNum(expected)})`;

      const endEffective       = String(effectivePeriod.end_date).slice(0, 10);
      const startEffective     = String(effectivePeriod.start_date).slice(0, 10);
      const remainingEffective = todayStr <= endEffective
        ? Math.ceil((new Date(endEffective) - new Date(todayStr)) / 86400000) + 1
        : 0;
      const totalPeriodDays  = Math.ceil((new Date(endEffective) - new Date(startEffective)) / 86400000) + 1;
      const daysElapsed      = todayStr >= startEffective
        ? Math.min(totalPeriodDays, Math.ceil((new Date(todayStr) - new Date(startEffective)) / 86400000) + 1)
        : 0;
      const projectedActual    = daysElapsed > 0
        ? Math.round((actual / daysElapsed) * totalPeriodDays)
        : 0;
      const projectedShortfall = Math.max(0, weeklyTarget - projectedActual);
      const shortfall          = weeklyTarget - actual;
      const catchUpPerDay      = !isInverse && shortfall > 0 && remainingEffective > 0
        ? Math.ceil(shortfall / remainingEffective)
        : null;

      // Campaign completion badge (always campaign-scoped)
      const campaignTotalForBadge  = resolveTarget(targets, m.id, period)?.weekly_target || 0;
      const campaignActualForBadge = campaignActualMap[m.id] || 0;
      const campaignCompletionPct  = isCampaign && campaignTotalForBadge
        ? Math.round((campaignActualForBadge / campaignTotalForBadge) * 100)
        : null;

      result[m.id] = {
        actual,
        weeklyTarget,
        pct,
        expected,
        dailyTarget: dt,
        color,
        status,
        gap,
        isAhead,
        gapLabel,
        catchUpPerDay,
        remainingDays: remainingEffective,
        isInverse,
        isCampaign,
        campaignCompletionPct,
        projectedActual,
        projectedShortfall,
        daysElapsed,
      };
    });

    return result;
  }, [metrics, targets, entries, period, campaignPeriod, campaignEntries, tab, numSiblingWeeks, siblingPeriods]);
}
