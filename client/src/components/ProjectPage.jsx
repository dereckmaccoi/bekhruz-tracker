import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi.js';
import { usePace } from '../hooks/usePace.js';
import { colorKey, formatNum, COLOR_CLASSES, dailyTarget, detectActivePeriod, pacePercent, weeklyPercent } from '../utils/calculations.js';
import MetricBar from './shared/MetricBar.jsx';
import DayChart from './shared/DayChart.jsx';
import HistoryTable from './shared/HistoryTable.jsx';
import TrendChart from './shared/TrendChart.jsx';
import { useLang } from '../i18n/LangContext.jsx';

// ── Period Comparison ────────────────────────────────────────────────────────
// Shows the last N periods side-by-side, one column per period, one row per
// metric. Current period uses pace% (actual vs expected-by-today);
// completed periods use weekly% (actual vs full target).
function PeriodComparison({ metrics, periods, allEntries, allTargets, currentPeriodId }) {
  const today = new Date().toISOString().slice(0, 10);

  // Only compare periods at the same hierarchy level as the current one.
  // If the current period is a week (has parent_id), compare only weeks.
  // If it's a standalone campaign, compare only standalone periods.
  const currentPeriod = periods.find(p => p.id === currentPeriodId);
  const sameLevelPeriods = currentPeriod?.parent_id
    ? periods.filter(p => p.parent_id === currentPeriod.parent_id)
    : periods.filter(p => !p.parent_id);

  // Show up to 5 most-recent same-level periods (oldest → newest left-to-right)
  const sorted = [...sameLevelPeriods]
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    .slice(-5);

  if (sorted.length < 2) return null;  // nothing to compare

  // Sum entries for a metric in a period (date-range filtering — more reliable than period_id)
  const getActual = (period, metricId) => {
    const s = String(period.start_date).slice(0, 10);
    const e = String(period.end_date).slice(0, 10);
    return (allEntries || [])
      .filter(en => en.metric_id === metricId && String(en.date).slice(0, 10) >= s && String(en.date).slice(0, 10) <= e)
      .reduce((sum, en) => sum + Number(en.value), 0);
  };

  // Get weekly target for a metric (targets may be period-specific or shared)
  const getTarget = (period, metricId) => {
    // Prefer period-specific target, fall back to any target for this metric
    const t = (allTargets || []).find(t => t.period_id === period.id && t.metric_id === metricId)
           || (allTargets || []).find(t => t.metric_id === metricId);
    return t?.weekly_target || 0;
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-4">
        Period Comparison
      </h2>

      <table className="w-full text-xs" style={{ minWidth: 300 }}>
        <thead>
          <tr>
            <th className="text-left pb-2 text-stone-400 font-medium pr-3 whitespace-nowrap">Metric</th>
            {sorted.map(p => {
              const isCurrent = p.id === currentPeriodId;
              const label = p.name || String(p.start_date).slice(5, 10);
              return (
                <th
                  key={p.id}
                  className={`text-center pb-2 px-2 font-medium whitespace-nowrap ${
                    isCurrent ? 'text-stone-800' : 'text-stone-400'
                  }`}
                >
                  {isCurrent ? <span className="inline-block bg-stone-800 text-white rounded px-1.5 py-0.5 text-[10px]">{label}</span>
                              : <span>{label}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {metrics.map(m => (
            <tr key={m.id} className="border-t border-stone-100">
              <td className="py-2 pr-3 text-stone-600 font-medium whitespace-nowrap">{m.name}</td>
              {sorted.map(p => {
                const isCurrent   = p.id === currentPeriodId;
                const isCompleted = String(p.end_date).slice(0, 10) < today;
                const actual      = getActual(p, m.id);
                const wt          = getTarget(p, m.id);
                const isInverse   = !!m.is_inverse;

                // Compute period.days if not present
                const pDays = p.days ?? (Math.round(
                  (new Date(String(p.end_date).slice(0, 10)) - new Date(String(p.start_date).slice(0, 10))) / 86400000
                ) + 1);
                const periodObj = { ...p, days: pDays };

                const pct = isCurrent && !isCompleted
                  ? pacePercent(actual, wt, periodObj, isInverse)
                  : weeklyPercent(actual, wt, isInverse);

                const ck = colorKey(pct, isInverse);
                const c  = COLOR_CLASSES[ck] || COLOR_CLASSES.gray;
                const barW = Math.min(100, pct ?? 0);

                return (
                  <td key={p.id} className={`py-2 px-2 text-center ${isCurrent ? 'bg-stone-50' : ''}`}>
                    {wt > 0 ? (
                      <div className="flex flex-col items-center gap-1">
                        {/* % badge */}
                        <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${c.tag}`}>
                          {pct !== null ? `${pct}%` : '—'}
                        </span>
                        {/* mini bar */}
                        <div className="w-full h-1 bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.bar}`}
                            style={{ width: `${barW}%`, transition: 'width 0.4s ease' }}
                          />
                        </div>
                        {/* actual / target */}
                        <span className="text-[10px] text-stone-400">
                          {formatNum(actual)}<span className="text-stone-300">/{formatNum(wt)}</span>
                        </span>
                      </div>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PROJECT_META = {
  tsb: { name: 'TSB', color: '#E24B4A' },
  fc: { name: 'Full Contact', color: '#1D9E75' },
  mc: { name: 'Milliard Club', color: '#7F77DD' },
  sd: { name: 'Sales Doctor', color: '#BA7517' },
};

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-6 bg-stone-200 rounded w-1/3" />
      <div className="h-32 bg-stone-200 rounded" />
      <div className="h-32 bg-stone-200 rounded" />
    </div>
  );
}

export default function ProjectPage() {
  const { t } = useLang();
  const { id } = useParams();
  const navigate = useNavigate();
  const meta = PROJECT_META[id] || { name: id, color: '#888' };

  // Load project-specific periods independently (not from global App.jsx state)
  const [projectPeriods, setProjectPeriods] = useState([]);
  const [period, setPeriod]                 = useState(null);

  const [data, setData]                     = useState(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [selectedMetricId, setSelectedMetricId] = useState(null);
  const [tab, setTab]                       = useState('week'); // 'week' | 'campaign'
  const [smartRedistDismissed, setSmartRedistDismissed] = useState(false);

  // Load periods for this project whenever the project changes
  useEffect(() => {
    setData(null);
    setSelectedMetricId(null);
    setTab('week');
    api.getPeriods({ project_id: id }).then(ps => {
      setProjectPeriods(ps);
      setPeriod(detectActivePeriod(ps));
    }).catch(() => {});
  }, [id]);

  // Load project data whenever the period changes
  useEffect(() => {
    if (!period) return;
    setLoading(true);
    api.getProject(id, period.id)
      .then(d => {
        setData(d);
        if (d.metrics?.length && !selectedMetricId) setSelectedMetricId(d.metrics[0].id);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, period?.id]);

  // Pre-filter entries to only the selected period's date range so usePace
  // doesn't sum data from other periods when navigating history.
  const pStart = period ? String(period.start_date).slice(0, 10) : '';
  const pEnd   = period ? String(period.end_date).slice(0, 10) : '';
  const periodEntries = data?.entries?.filter(e => {
    const d = String(e.date).slice(0, 10);
    return d >= pStart && d <= pEnd;
  });

  // If the current period is a week (has parent_id), find the parent campaign
  // so campaign-type metrics can compute pace over the full campaign duration.
  const campaignPeriod = period?.parent_id
    ? projectPeriods.find(p => p.id === period.parent_id) ?? null
    : null;

  // Campaign-scoped entries span the parent campaign's full date range.
  const cStart = campaignPeriod ? String(campaignPeriod.start_date).slice(0, 10) : '';
  const cEnd   = campaignPeriod ? String(campaignPeriod.end_date).slice(0, 10) : '';
  const campaignEntries = campaignPeriod
    ? data?.entries?.filter(e => {
        const d = String(e.date).slice(0, 10);
        return d >= cStart && d <= cEnd;
      })
    : null;

  // Count sibling week periods — used for proportional weekly target in week tab.
  const siblingWeeks = period?.parent_id
    ? projectPeriods.filter(p => p.parent_id === period.parent_id)
    : [];

  // Estimate TOTAL expected sub-periods in the campaign from campaign duration.
  // This prevents the "400 target for 1 week" bug when only the first week has been created.
  const avgWeekDays = siblingWeeks.length > 0
    ? siblingWeeks.reduce((sum, w) =>
        sum + Math.ceil((new Date(String(w.end_date).slice(0, 10)) - new Date(String(w.start_date).slice(0, 10))) / 86400000) + 1,
      0) / siblingWeeks.length
    : 7;
  const _campaignDays = campaignPeriod
    ? Math.ceil((new Date(String(campaignPeriod.end_date).slice(0, 10)) - new Date(String(campaignPeriod.start_date).slice(0, 10))) / 86400000) + 1
    : 0;
  const numSiblingWeeks = _campaignDays > 0
    ? Math.max(siblingWeeks.length, Math.round(_campaignDays / avgWeekDays))
    : (siblingWeeks.length || 1);

  const pace = usePace(
    data?.metrics,
    data?.targets,
    periodEntries,
    period,
    campaignPeriod,
    campaignEntries,
    tab,
    numSiblingWeeks,
    siblingWeeks,  // for auto-rollover from completed periods
  );

  if (!period && projectPeriods.length === 0 && !loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
          <h1 className="text-xl font-semibold text-stone-900">{meta.name}</h1>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-6 text-center text-sm text-stone-400">
          {t('noTargetsSet')}{' '}
          <button
            className="underline hover:text-stone-600"
            onClick={() => navigate('/workshop', { state: { tab: 'targets', project: id } })}
          >
            {t('goToWorkshopTargets')}
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <Skeleton />;
  if (error) return (
    <div className="p-6">
      <div className="bg-[#FCEBEB] border border-[#E24B4A] rounded-lg p-4 text-sm text-[#791F1F]">
        Error: {error}
      </div>
    </div>
  );
  if (!data) return null;

  const { metrics, targets, entries } = data;

  const pcts = metrics.map(m => pace[m.id]?.pct).filter(p => p !== null && p !== undefined);
  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const projColor = colorKey(avgPct, false);
  const projC = COLOR_CLASSES[projColor] || COLOR_CLASSES.gray;

  const isBehind = avgPct !== null && avgPct < 70;
  // Find the metric with the lowest pace % — works correctly for both
  // regular and inverse metrics since pct is always lower when behind.
  const mostBehind = metrics
    .filter(m => pace[m.id]?.pct !== null && pace[m.id]?.pct !== undefined && pace[m.id].pct < 100)
    .sort((a, b) => pace[a.id].pct - pace[b.id].pct)[0];

  const today = new Date().toISOString().slice(0, 10);
  const daysLeft = period
    ? Math.max(0, Math.ceil((new Date(period.end_date) - new Date(today)) / 86400000))
    : 0;

  const selectedMetric  = metrics.find(m => m.id === selectedMetricId);
  const selectedTarget  = targets.find(tgt => tgt.metric_id === selectedMetricId);

  // Filter by date range (not period_id) — entries saved before per-project periods
  // were added may have a different period_id, so date-range matching is more reliable.
  const periodStart = String(period?.start_date).slice(0, 10);
  const periodEnd   = String(period?.end_date).slice(0, 10);
  const selectedEntries = entries.filter(e => {
    const d = String(e.date).slice(0, 10);
    return e.metric_id === selectedMetricId && d >= periodStart && d <= periodEnd;
  });

  const hasTargets = targets.length > 0;

  // Period navigation — arrows step through sibling periods only.
  // In week mode: navigate among weeks with the same parent_id.
  // In campaign mode: navigate among top-level campaigns (no parent_id).
  const sortedPeriods = [...projectPeriods].sort((a, b) => a.start_date.localeCompare(b.start_date));

  const siblingPeriods = tab === 'campaign'
    ? sortedPeriods.filter(p => !p.parent_id)
    : period?.parent_id
      ? sortedPeriods.filter(p => p.parent_id === period.parent_id)
      : sortedPeriods.filter(p => !p.parent_id);

  // Last 12 same-level periods for trend chart (oldest → newest)
  const trendPeriods = siblingPeriods.slice(-12);

  const currentIdx  = siblingPeriods.findIndex(p => p.id === period?.id);
  const prevPeriod  = siblingPeriods[currentIdx - 1] ?? null;
  const nextPeriod  = siblingPeriods[currentIdx + 1] ?? null;

  // Parent campaign (if current period is a week)
  const parentCampaign = period?.parent_id
    ? projectPeriods.find(p => p.id === period.parent_id) ?? null
    : null;

  // Week-over-week trend (only in week tab, requires a previous sibling period)
  const trendMap = {};
  if (tab === 'week' && prevPeriod) {
    const prevStart = String(prevPeriod.start_date).slice(0, 10);
    const prevEnd   = String(prevPeriod.end_date).slice(0, 10);
    const prevActualMap = {};
    entries.forEach(e => {
      const d = String(e.date).slice(0, 10);
      if (d >= prevStart && d <= prevEnd) {
        prevActualMap[e.metric_id] = (prevActualMap[e.metric_id] || 0) + Number(e.value);
      }
    });
    metrics.forEach(m => {
      const thisWeekPct = pace[m.id]?.pct;
      const prevActual  = prevActualMap[m.id] || 0;
      const prevTarget  = targets.find(t => t.metric_id === m.id)?.weekly_target || 0;
      const prevPct     = weeklyPercent(prevActual, prevTarget, !!m.is_inverse);
      if (thisWeekPct !== null && thisWeekPct !== undefined && prevPct !== null) {
        trendMap[m.id] = thisWeekPct - prevPct;
      }
    });
  }

  // Funnel conversion rates: adjacent non-inverse metrics sorted by sort_order
  const funnelMetrics = [...metrics]
    .filter(m => !m.is_inverse)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // Only show CVR for pairs where downstream ≤ upstream (genuine funnel conversion).
  // Skips pairs where the downstream metric exceeds upstream — those indicate
  // mis-ordered sort_order or non-funnel data, and would show misleading >100% rates.
  const funnelRates = funnelMetrics.slice(0, -1).flatMap((mA, i) => {
    const mB      = funnelMetrics[i + 1];
    const actualA = pace[mA.id]?.actual || 0;
    const actualB = pace[mB.id]?.actual || 0;
    if (actualA === 0 || actualB > actualA) return [];
    const rate = Math.round((actualB / actualA) * 100);
    return [{ from: mA.name, to: mB.name, rate }];
  });

  // Smart redistribution: trigger amber nudge when pace is low after 3+ days into period
  const showSmartRedist = tab === 'week' && !smartRedistDismissed && (() => {
    if (avgPct === null || avgPct >= 70) return false;
    return metrics.some(m => (pace[m.id]?.daysElapsed ?? 0) >= 3 && (pace[m.id]?.pct ?? 100) < 70);
  })();

  // Tab bar visibility: show whenever the project has a week/campaign structure
  const hasWeekStructure = projectPeriods.some(p => !!p.parent_id);
  // Campaign name for the tab label — works in both week tab (parentCampaign) and campaign tab (period itself)
  const campaignTabName = parentCampaign?.name ?? (tab === 'campaign' ? period?.name : null) ?? 'Campaign';

  // Switch tab and navigate to the right period
  const handleTabSwitch = (newTab) => {
    if (newTab === tab) return;
    if (newTab === 'campaign') {
      // Navigate to campaign period — use parentCampaign if on a week, or period itself if already at campaign level
      const campaignTarget = parentCampaign ?? (period?.parent_id ? null : period);
      if (campaignTarget) setPeriod(campaignTarget);
    } else if (newTab === 'week') {
      const today2 = new Date().toISOString().slice(0, 10);
      // When on campaign tab, period.id IS the campaign id; use it to find child weeks
      const campaignId = parentCampaign ? parentCampaign.id : period?.id;
      const activeWeek = projectPeriods.find(p =>
        p.parent_id === campaignId &&
        String(p.start_date).slice(0, 10) <= today2 &&
        String(p.end_date).slice(0, 10) >= today2
      ) || projectPeriods.find(p => p.parent_id === campaignId);
      if (!activeWeek) return; // no weeks exist — don't switch tab
      setPeriod(activeWeek);
    }
    setTab(newTab);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-0">
        {/* Top row: project name + period nav + pace badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
          <h1 className="text-xl font-semibold text-stone-900">{meta.name}</h1>

          {/* Period navigation */}
          {period && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => prevPeriod && setPeriod(prevPeriod)}
                disabled={!prevPeriod}
                className="w-5 h-5 flex items-center justify-center rounded text-stone-400 hover:text-stone-600 disabled:opacity-25 text-sm"
              >←</button>
              <span className="text-sm text-stone-400">
                {period.name} · {String(period.start_date).slice(8,10)}/{String(period.start_date).slice(5,7)} – {String(period.end_date).slice(8,10)}/{String(period.end_date).slice(5,7)}
              </span>
              <button
                onClick={() => nextPeriod && setPeriod(nextPeriod)}
                disabled={!nextPeriod}
                className="w-5 h-5 flex items-center justify-center rounded text-stone-400 hover:text-stone-600 disabled:opacity-25 text-sm"
              >→</button>
            </div>
          )}

          <span className={`text-xs px-2 py-0.5 rounded font-medium ${projC.tag}`}>
            {avgPct !== null ? `${avgPct}%` : '—'}
          </span>
        </div>

        {/* Tab bar — shown whenever the project has a week/campaign structure */}
        {hasWeekStructure && (
          <div className="flex gap-0 border-b border-stone-200 mt-3">
            <button
              onClick={() => handleTabSwitch('week')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'week'
                  ? 'border-stone-800 text-stone-900'
                  : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => handleTabSwitch('campaign')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'campaign'
                  ? 'border-stone-800 text-stone-900'
                  : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}
            >
              {campaignTabName}
            </button>
          </div>
        )}
      </div>

      {/* Alert — uses the behindAlert translation key properly */}
      {isBehind && mostBehind && (
        <div className="bg-[#FCEBEB] border border-[#E24B4A] rounded-lg px-4 py-3 text-sm text-[#791F1F]">
          {t('behindAlert', {
            n: formatNum(Math.abs(pace[mostBehind.id].gap)),
            metric: mostBehind.name.toLowerCase(),
            days: daysLeft,
            s: daysLeft === 1 ? '' : 's',
          })}
        </div>
      )}

      {/* Smart redistribution nudge — shown when pace < 70% after 3+ days */}
      {showSmartRedist && (
        <div className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <span>
            📊 You're behind pace. At this rate, you'll finish at{' '}
            <strong>
              {(() => {
                const validPcts = metrics
                  .map(m => {
                    const p = pace[m.id];
                    if (!p || !p.weeklyTarget) return null;
                    return Math.round((p.projectedActual / p.weeklyTarget) * 100);
                  })
                  .filter(p => p !== null);
                return validPcts.length
                  ? Math.round(validPcts.reduce((a, b) => a + b, 0) / validPcts.length)
                  : '?';
              })()}%
            </strong>{' '}
            of target. Consider pushing harder on remaining days to catch up.
          </span>
          <button
            onClick={() => setSmartRedistDismissed(true)}
            className="shrink-0 text-amber-500 hover:text-amber-700 text-base leading-none"
            aria-label="Dismiss"
          >×</button>
        </div>
      )}

      {/* Metrics */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
          {tab === 'campaign' ? 'THIS CAMPAIGN — METRICS' : t('thisWeekMetrics')}
        </h2>
        {!hasTargets ? (
          <p className="text-sm text-stone-400">
            {t('noTargetsSet')}{' '}
            <button
              className="underline hover:text-stone-600"
              onClick={() => navigate('/workshop', { state: { tab: 'targets', project: id } })}
            >
              {t('goToWorkshopTargets')}
            </button>
          </p>
        ) : (
          <>
            <div className="divide-y divide-stone-100">
              {metrics.map(m => (
                <MetricBar key={m.id} metric={m} pace={pace[m.id]} trend={trendMap[m.id] ?? null} />
              ))}
            </div>
            {funnelRates.length > 0 && (
              <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap gap-x-5 gap-y-1">
                {funnelRates.map((r, i) => (
                  <span key={i} className="text-xs text-stone-400">
                    {r.from} → {r.to}:{' '}
                    <span className="font-medium text-stone-600">{r.rate !== null ? `${r.rate}%` : '—'}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Period Comparison — week mode only */}
      {tab === 'week' && hasTargets && sortedPeriods.length >= 2 && (
        <PeriodComparison
          metrics={metrics}
          periods={sortedPeriods}
          allEntries={entries}
          allTargets={targets}
          currentPeriodId={period?.id}
        />
      )}

      {/* 12-week trend chart */}
      {tab === 'week' && hasTargets && trendPeriods.length >= 2 && (
        <TrendChart
          metrics={metrics}
          periods={trendPeriods}
          allEntries={entries}
          allTargets={targets}
          currentPeriodId={period?.id}
        />
      )}

      {/* Day by day */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
          {t('dayByDay')}
        </h2>
        <div className="flex gap-1 mb-4 flex-wrap">
          {metrics.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMetricId(m.id)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                selectedMetricId === m.id
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
        {selectedMetric && period && (
          <DayChart
            metric={selectedMetric}
            entries={selectedEntries}
            period={tab === 'campaign' ? (campaignPeriod ?? period) : period}
            weeklyTarget={selectedTarget?.weekly_target || 0}
          />
        )}
      </div>

      {/* Targets table */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">
            {t('targets')}
          </h2>
          <button
            onClick={() => navigate('/workshop', { state: { tab: 'targets', project: id } })}
            className="text-xs text-stone-400 hover:text-stone-600 underline"
          >
            {t('editInWorkshop')}
          </button>
        </div>
        <div className="divide-y divide-stone-100">
          {metrics.map(m => {
            const tgt = targets.find(tgt => tgt.metric_id === m.id)
                      || (period?.parent_id
                          ? targets.find(t => t.period_id === period.parent_id && t.metric_id === m.id)
                          : null);
            const wt = tgt?.weekly_target || 0;
            const dtPeriod = (m.type === 'campaign' || tab === 'campaign')
              ? (campaignPeriod ?? period)
              : period;
            const dt = dtPeriod ? dailyTarget(wt, dtPeriod) : 0;
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-stone-700 font-medium truncate">{m.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-400 capitalize shrink-0">
                    {m.type}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-stone-800">{formatNum(wt)}</div>
                  <div className="text-[11px] text-stone-400">{formatNum(dt)}/day</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* History */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
          {t('history')}
        </h2>
        <HistoryTable
          metrics={metrics}
          periods={tab === 'week' ? siblingPeriods : sortedPeriods.filter(p => !p.parent_id)}
          allEntries={entries}
          allTargets={targets}
        />
      </div>
    </div>
  );
}
