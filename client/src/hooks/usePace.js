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
 * @param metrics          - array of metric objects (with .type)
 * @param targets          - array of target objects (with .metric_id, .weekly_target)
 * @param entries          - entries filtered to the current week/period date range
 * @param period           - the current period (week or standalone)
 * @param campaignPeriod   - optional parent campaign period
 * @param campaignEntries  - optional entries for the whole campaign date range
 * @param tab              - 'week' | 'campaign' (default: 'week')
 * @param numSiblingWeeks  - number of sibling week periods (for proportional target, default: 1)
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

    // Days remaining in the current week period (including today)
    const todayStr      = new Date().toISOString().slice(0, 10);

    const result = {};
    metrics.forEach(m => {
      const isCampaign = m.type === 'campaign';
      const isInverse  = m.type === 'inverse';

      // ── Determine weeklyTarget ──────────────────────────────────────────
      let weeklyTarget;
      if (isCampaign) {
        // Week-specific override takes priority (set manually in TargetsTab)
        const weekOverride = targets.find(
          t => t.period_id === period.id && t.metric_id === m.id
        );
        // Always look up campaign total from the parent campaign period directly
        // (resolveTarget would return weekOverride if one exists, which is wrong here)
        const campaignTotalEntry = period.parent_id
          ? targets.find(t => t.period_id === period.parent_id && t.metric_id === m.id)
          : targets.find(t => t.period_id === period.id && t.metric_id === m.id);
        const campaignTotal = campaignTotalEntry?.weekly_target ?? 0;

        if (tab === 'week') {
          // Use override if set; otherwise proportional slice of campaign total
          weeklyTarget = weekOverride?.weekly_target != null
            ? weekOverride.weekly_target
            : Math.ceil(campaignTotal / (numSiblingWeeks > 0 ? numSiblingWeeks : 1));
        } else {
          // Campaign tab: show full campaign total
          weeklyTarget = campaignTotal;
        }
      } else {
        const target = resolveTarget(targets, m.id, period);
        weeklyTarget = target?.weekly_target || 0;
      }

      // ── Determine effectivePeriod and actual ────────────────────────────
      // Week tab: campaign metrics use the current week period + week entries
      // Campaign tab: campaign metrics use the campaign period + campaign entries
      const effectivePeriod = (isCampaign && tab === 'campaign' && campaignPeriod)
        ? campaignPeriod
        : period;

      const actual = (isCampaign && tab === 'campaign' && campaignEntries)
        ? (campaignActualMap[m.id] || 0)
        : (actualMap[m.id] || 0);

      // ── Pace calculations ───────────────────────────────────────────────
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

      // Remaining days in the effective period
      const endEffective       = String(effectivePeriod.end_date).slice(0, 10);
      const startEffective     = String(effectivePeriod.start_date).slice(0, 10);
      const remainingEffective = todayStr <= endEffective
        ? Math.ceil((new Date(endEffective) - new Date(todayStr)) / 86400000) + 1
        : 0;
      const totalPeriodDays  = Math.ceil((new Date(endEffective) - new Date(startEffective)) / 86400000) + 1;
      const daysElapsed      = todayStr >= startEffective
        ? Math.min(totalPeriodDays, Math.ceil((new Date(todayStr) - new Date(startEffective)) / 86400000) + 1)
        : 0;
      const projectedActual  = daysElapsed > 0
        ? Math.round((actual / daysElapsed) * totalPeriodDays)
        : 0;
      const projectedShortfall = Math.max(0, weeklyTarget - projectedActual);

      const shortfall      = weeklyTarget - actual;
      const catchUpPerDay  = !isInverse && shortfall > 0 && remainingEffective > 0
        ? Math.ceil(shortfall / remainingEffective)
        : null;

      // ── Campaign completion badge (always campaign-scoped) ───────────────
      // Shows total campaign progress regardless of which tab is active.
      const campaignTotalForBadge   = resolveTarget(targets, m.id, period)?.weekly_target || 0;
      const campaignActualForBadge  = campaignActualMap[m.id] || 0;
      const campaignCompletionPct   = isCampaign && campaignTotalForBadge
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
  }, [metrics, targets, entries, period, campaignPeriod, campaignEntries, tab, numSiblingWeeks]);
}
