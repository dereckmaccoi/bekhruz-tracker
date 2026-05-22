import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi.js';
import { pacePercent, weeklyPercent, colorKey, formatNum, COLOR_CLASSES, detectActivePeriod, resolveTarget } from '../utils/calculations.js';
import { useLang } from '../i18n/LangContext.jsx';
import { useProjects } from '../context/ProjectsContext.jsx';

function fmtDate(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  return s.slice(8) + '/' + s.slice(5, 7);
}

// Build array of YYYY-MM-DD strings for every day in the period
function periodDays(period) {
  const days = [];
  const end = String(period.end_date).slice(0, 10);
  let cur = new Date(String(period.start_date).slice(0, 10));
  while (true) {
    const s = cur.toISOString().slice(0, 10);
    days.push(s);
    if (s >= end) break;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// Tiny bar-chart sparkline: one bar per day, colored by value vs daily target
function Sparkline({ entries, period, dailyTarget: dt }) {
  const days = periodDays(period);
  const today = new Date().toISOString().slice(0, 10);

  const byDate = {};
  entries.forEach(e => { byDate[String(e.date).slice(0, 10)] = Number(e.value); });

  return (
    <div className="flex items-end gap-px mt-2.5 rounded overflow-hidden" style={{ height: 20 }}>
      {days.map(day => {
        const val = byDate[day];
        const isFuture = day > today;
        const isEmpty = val === undefined || val === 0;
        const pct = (!isEmpty && dt) ? Math.min(100, (val / dt) * 100) : (isEmpty ? 0 : 100);
        const bg = isFuture || isEmpty
          ? '#E7E5DF'
          : val >= dt
            ? '#1D9E75'
            : val >= dt * 0.7
              ? '#EF9F27'
              : '#E24B4A';
        return (
          <div
            key={day}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: isEmpty || isFuture ? 3 : `${Math.max(15, pct)}%`,
              backgroundColor: bg,
              opacity: isFuture ? 0.35 : 1,
            }}
          />
        );
      })}
    </div>
  );
}

function CardSkeleton({ color }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="p-5 animate-pulse space-y-4">
        <div className="flex justify-between items-start">
          <div className="h-5 bg-stone-100 rounded w-28" />
          <div className="h-7 bg-stone-100 rounded-lg w-14" />
        </div>
        <div className="h-2 bg-stone-100 rounded-full" />
        <div className="flex gap-4">
          <div className="h-8 bg-stone-50 rounded-lg flex-1" />
          <div className="h-8 bg-stone-50 rounded-lg flex-1" />
          <div className="h-8 bg-stone-50 rounded-lg flex-1" />
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project, period, data, periods = [] }) {
  const navigate = useNavigate();
  const { t } = useLang();

  /* ── No period / no data ── */
  if (!data || !period) {
    return (
      <div
        className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => navigate(`/project/${project.id}`)}
      >
        <div className="h-1" style={{ backgroundColor: project.color }} />
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="font-semibold text-stone-800 text-base">{project.name}</span>
          </div>
          <p className="text-sm text-stone-400">{t('noTargetsSet')}</p>
          <p className="text-xs text-stone-300 mt-1">{t('goToWorkshopTargets')}</p>
        </div>
      </div>
    );
  }

  const { metrics = [], targets = [], entries: allEntries = [] } = data;
  // Filter by date range — more reliable than period_id matching across old/new periods
  const periodStart = String(period.start_date).slice(0, 10);
  const periodEnd   = String(period.end_date).slice(0, 10);
  const entries = allEntries.filter(e => {
    const d = String(e.date).slice(0, 10);
    return d >= periodStart && d <= periodEnd;
  });

  const targetMap = {};
  targets.forEach(tgt => { targetMap[tgt.metric_id] = tgt; });
  const actualMap = {};
  entries.forEach(e => { actualMap[e.metric_id] = (actualMap[e.metric_id] || 0) + Number(e.value); });

  const pcts = metrics
    .map(m => {
      const tgt = targetMap[m.id];
      if (!tgt) return null;
      return pacePercent(actualMap[m.id] || 0, tgt.weekly_target, period, !!m.is_inverse);
    })
    .filter(p => p !== null);

  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const color = colorKey(avgPct, false);
  const c = COLOR_CLASSES[color] || COLOR_CLASSES.gray;
  const hasTargets = targets.length > 0;

  // Period-over-period badge
  const sameLevelPeriods = period?.parent_id
    ? (periods || []).filter(p => p.parent_id === period.parent_id)
    : (periods || []).filter(p => !p.parent_id);
  const sortedSame = [...sameLevelPeriods].sort((a, b) =>
    String(a.start_date).localeCompare(String(b.start_date))
  );
  const currentIdx = sortedSame.findIndex(p => p.id === period.id);
  const prevPeriod = currentIdx > 0 ? sortedSame[currentIdx - 1] : null;

  let popBadge = null;
  if (prevPeriod && avgPct !== null) {
    const prevStart = String(prevPeriod.start_date).slice(0, 10);
    const prevEnd   = String(prevPeriod.end_date).slice(0, 10);
    // allEntries contains all-time data (not period-filtered) — required for prev-period lookup
    const prevEntries = allEntries.filter(e => {
      const d = String(e.date).slice(0, 10);
      return d >= prevStart && d <= prevEnd;
    });
    const prevActualMap = {};
    prevEntries.forEach(e => {
      prevActualMap[e.metric_id] = (prevActualMap[e.metric_id] || 0) + Number(e.value);
    });
    // Prev period is always completed (it's in the past) — use weeklyPercent
    const prevPcts = metrics.map(m => {
      const tgt = targetMap[m.id];
      if (!tgt) return null;
      return weeklyPercent(prevActualMap[m.id] || 0, tgt.weekly_target, !!m.is_inverse);
    }).filter(p => p !== null);
    const prevAvgPct = prevPcts.length
      ? Math.round(prevPcts.reduce((a, b) => a + b, 0) / prevPcts.length)
      : null;
    if (prevAvgPct !== null) {
      const delta = avgPct - prevAvgPct;
      const isGreen = delta > 5;
      const isRed   = delta < -5;
      popBadge = {
        delta,
        prevName: prevPeriod.name || 'prev',
        arrow: isGreen ? '↑' : isRed ? '↓' : '→',
        sign: delta > 0 ? '+' : '',
        cls: isGreen
          ? 'bg-[#E1F5EE] text-[#085041] border border-[#1D9E75]'
          : isRed
          ? 'bg-[#FCEBEB] text-[#791F1F] border border-[#E24B4A]'
          : 'bg-[#F1EFE8] text-[#444441] border border-stone-300',
      };
    }
  }

  // Campaign badge: average campaign-completion % for campaign-type metrics only
  const campaignPeriod = period?.parent_id
    ? (periods || []).find(p => p.id === period.parent_id) ?? null
    : null;

  const cStart = campaignPeriod ? String(campaignPeriod.start_date).slice(0, 10) : '';
  const cEnd   = campaignPeriod ? String(campaignPeriod.end_date).slice(0, 10) : '';
  const todayStr        = new Date().toISOString().slice(0, 10);
  const campaignDays    = campaignPeriod
    ? (Math.round((new Date(cEnd) - new Date(cStart)) / 86400000) + 1) || 0
    : 0;
  const campaignElapsed = campaignPeriod
    ? Math.min(
        campaignDays,
        Math.max(
          todayStr >= cStart ? 1 : 0,
          Math.round((new Date(Math.min(new Date(todayStr), new Date(cEnd))) - new Date(cStart)) / 86400000) + 1
        )
      )
    : 0;
  const campaignActualMap = {};
  if (campaignPeriod) {
    allEntries.forEach(e => {
      const d = String(e.date).slice(0, 10);
      if (d >= cStart && d <= cEnd) {
        campaignActualMap[e.metric_id] = (campaignActualMap[e.metric_id] || 0) + Number(e.value);
      }
    });
  }

  const campaignMetrics = metrics.filter(m => m.type === 'campaign');
  const campaignPcts = campaignMetrics.map(m => {
    const tgt = resolveTarget(targets, m.id, period);
    if (!tgt?.weekly_target) return null;
    const actual = campaignActualMap[m.id] || 0;
    return Math.round((actual / tgt.weekly_target) * 100);
  }).filter(p => p !== null);

  const avgCampaignPct = campaignPcts.length > 0
    ? Math.round(campaignPcts.reduce((a, b) => a + b, 0) / campaignPcts.length)
    : null;
  const projectedPct = campaignElapsed >= 3 && campaignDays > 0 && avgCampaignPct !== null
    ? Math.round((avgCampaignPct / campaignElapsed) * campaignDays)
    : null;
  const campaignColor = avgCampaignPct !== null ? colorKey(avgCampaignPct, false) : null;
  const cC = campaignColor ? (COLOR_CLASSES[campaignColor] || COLOR_CLASSES.gray) : null;

  return (
    <div
      className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5"
      onClick={() => navigate(`/project/${project.id}`)}
    >
      {/* Color strip */}
      <div className="h-1" style={{ backgroundColor: project.color }} />

      <div className="p-5 space-y-3">
        {/* Top row: project name + week badge + delta badge */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-bold text-stone-900 text-base leading-tight">{project.name}</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {hasTargets && avgPct !== null && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${c.tag}`}>
                {avgPct}% week
              </span>
            )}
            {popBadge !== null && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${popBadge.cls}`}>
                {popBadge.arrow} {popBadge.sign}{popBadge.delta}% vs {popBadge.prevName}
              </span>
            )}
          </div>
        </div>

        {/* Campaign progress bar — primary element */}
        {hasTargets && campaignPeriod && avgCampaignPct !== null && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-stone-500 font-medium">
                {campaignPeriod.name} · {campaignElapsed} of {campaignDays} days
                {projectedPct !== null && ` · on track for ${projectedPct}%`}
              </span>
              <span className={`text-[11px] font-semibold ${cC?.text || 'text-stone-500'}`}>
                {avgCampaignPct}%
              </span>
            </div>
            <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${cC?.bar || 'bg-stone-300'}`}
                style={{ width: `${Math.min(100, avgCampaignPct)}%` }}
              />
            </div>
          </div>
        )}

        {/* Week pace row — secondary (date range + pace %) */}
        {hasTargets && period && (
          <div className="flex items-center justify-between text-[11px] text-stone-400">
            <span>{period.name} · {fmtDate(period.start_date)}–{fmtDate(period.end_date)}</span>
            {avgPct !== null && (
              <span className={`font-medium ${
                avgPct >= 90 ? 'text-[#085041]' :
                avgPct >= 70 ? 'text-[#633806]' : 'text-[#791F1F]'
              }`}>
                {avgPct}% pace
              </span>
            )}
          </div>
        )}

        {/* Fallback progress bar — shown only when there is no campaign bar */}
        {hasTargets && !campaignPeriod && (
          <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${c.bar}`}
              style={{ width: `${Math.min(100, avgPct ?? 0)}%` }}
            />
          </div>
        )}

        {/* Funnel conversion rates */}
        {hasTargets && (() => {
          const fm = [...metrics]
            .filter(m => !m.is_inverse)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const rates = fm.slice(0, -1).map((mA, i) => {
            const mB  = fm[i + 1];
            const aA  = actualMap[mA.id] || 0;
            const aB  = actualMap[mB.id] || 0;
            return aA > 0 ? { from: mA.name, to: mB.name, rate: Math.round((aB / aA) * 100) } : null;
          }).filter(Boolean);
          if (rates.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {rates.map((r, i) => (
                <span key={i} className="text-[10px] text-stone-400">
                  {r.from}→{r.to}: <span className="font-medium text-stone-500">{r.rate}%</span>
                </span>
              ))}
            </div>
          );
        })()}

        {/* Metric grid */}
        {hasTargets ? (
          <div className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.min(metrics.length, 3)}, 1fr)` }}
          >
            {metrics.slice(0, 3).map(m => {
              const actual = actualMap[m.id] || 0;
              const tgt = targetMap[m.id];
              const mPct = tgt
                ? pacePercent(actual, tgt.weekly_target, period, !!m.is_inverse)
                : null;
              const mColor = colorKey(mPct, false);
              const mC = COLOR_CLASSES[mColor] || COLOR_CLASSES.gray;
              const pDays = period.days || Math.round((new Date(String(period.end_date).slice(0,10)) - new Date(String(period.start_date).slice(0,10))) / 86400000) + 1;
              const dt = tgt ? tgt.weekly_target / pDays : 0;
              const remainingDays = todayStr <= periodEnd
                ? Math.max(1, Math.round((new Date(periodEnd) - new Date(todayStr)) / 86400000) + 1)
                : 1;
              const needPerDay = tgt && actual < tgt.weekly_target && !m.is_inverse
                ? Math.ceil((tgt.weekly_target - actual) / remainingDays)
                : null;
              const metricEntries = entries.filter(e => e.metric_id === m.id);
              return (
                <div key={m.id} className="bg-stone-50 rounded-xl px-3 py-2.5 min-w-0">
                  <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wide truncate mb-1">{m.name}</p>
                  <p className="text-base font-bold text-stone-800 leading-tight truncate">{formatNum(actual)}</p>
                  {tgt && (
                    <p className="text-[11px] text-stone-400 leading-tight">/ {formatNum(tgt.weekly_target)}</p>
                  )}
                  {tgt && (
                    <Sparkline entries={metricEntries} period={period} dailyTarget={dt} />
                  )}
                  {needPerDay !== null && needPerDay > 0 && (
                    <p className="text-[10px] text-amber-600 leading-tight mt-0.5">Need {formatNum(needPerDay)}/day</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-stone-400">{t('noTargetsSet')}</p>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t, lang } = useLang();
  const { projects: PROJECTS } = useProjects();
  const [projectData, setProjectData] = useState({});

  useEffect(() => {
    PROJECTS.forEach(proj => {
      setProjectData(prev => ({ ...prev, [proj.id]: { loading: true } }));
      api.getPeriods({ project_id: proj.id })
        .then(periods => {
          const period = detectActivePeriod(periods);
          if (!period) {
            setProjectData(prev => ({ ...prev, [proj.id]: { period: null, data: null, periods, loading: false } }));
            return null;
          }
          return api.getProject(proj.id, period.id).then(data => {
            setProjectData(prev => ({ ...prev, [proj.id]: { period, data, periods, loading: false } }));
          });
        })
        .catch(() => {
          setProjectData(prev => ({ ...prev, [proj.id]: { loading: false, error: true } }));
        });
    });
  }, []);

  const locale = lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-GB';
  const today = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  /* Summary counts */
  const loaded = PROJECTS.filter(p => projectData[p.id] && !projectData[p.id].loading && !projectData[p.id].error);
  let onTrackCount = 0, behindCount = 0;
  loaded.forEach(proj => {
    const pd = projectData[proj.id];
    if (!pd?.data || !pd?.period) return;
    const { metrics = [], targets = [], entries: allEntries = [] } = pd.data;
    const pStart = String(pd.period.start_date).slice(0, 10);
    const pEnd   = String(pd.period.end_date).slice(0, 10);
    const entries = allEntries.filter(e => {
      const d = String(e.date).slice(0, 10);
      return d >= pStart && d <= pEnd;
    });
    const targetMap = {};
    targets.forEach(tgt => { targetMap[tgt.metric_id] = tgt; });
    const actualMap = {};
    entries.forEach(e => { actualMap[e.metric_id] = (actualMap[e.metric_id] || 0) + Number(e.value); });
    const pcts = metrics.map(m => {
      const tgt = targetMap[m.id];
      if (!tgt) return null;
      return pacePercent(actualMap[m.id] || 0, tgt.weekly_target, pd.period, !!m.is_inverse);
    }).filter(p => p !== null);
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    if (avg !== null && avg < 70) behindCount++;
    else if (avg !== null) onTrackCount++;
  });

  const todayStr2 = new Date().toISOString().slice(0, 10);
  const isPastNoon2 = new Date().getHours() >= 12;
  const missingTodayEntry = isPastNoon2 && loaded.some(proj => {
    const pd = projectData[proj.id];
    if (!pd?.data) return false;
    const { entries: allEntries2 = [] } = pd.data;
    return !allEntries2.some(e => String(e.date).slice(0, 10) === todayStr2);
  });

  let campaignBehindCount = 0;
  loaded.forEach(proj => {
    const pd = projectData[proj.id];
    if (!pd?.data || !pd?.period) return;
    const { metrics = [], targets = [], entries: allEntries = [] } = pd.data;
    const cp = pd.period?.parent_id
      ? (pd.periods || []).find(p => p.id === pd.period.parent_id) ?? null
      : null;
    if (!cp) return;
    const cStart2 = String(cp.start_date).slice(0, 10);
    const cEnd2   = String(cp.end_date).slice(0, 10);
    const camActualMap = {};
    allEntries.forEach(e => {
      const d = String(e.date).slice(0, 10);
      if (d >= cStart2 && d <= cEnd2) {
        camActualMap[e.metric_id] = (camActualMap[e.metric_id] || 0) + Number(e.value);
      }
    });
    const camMetrics = metrics.filter(m => m.type === 'campaign');
    const camPcts = camMetrics.map(m => {
      const tgt = resolveTarget(targets, m.id, pd.period);
      if (!tgt?.weekly_target) return null;
      return Math.round(((camActualMap[m.id] || 0) / tgt.weekly_target) * 100);
    }).filter(p => p !== null);
    const avg = camPcts.length ? Math.round(camPcts.reduce((a, b) => a + b, 0) / camPcts.length) : null;
    if (avg !== null && avg < 70) campaignBehindCount++;
  });

  // Smart alerts: metrics behind pace with catch-up math
  const smartAlerts = [];
  loaded.forEach(proj => {
    const pd = projectData[proj.id];
    if (!pd?.data || !pd?.period) return;
    const { metrics = [], targets = [], entries: allEntries = [] } = pd.data;
    const pStart = String(pd.period.start_date).slice(0, 10);
    const pEnd   = String(pd.period.end_date).slice(0, 10);
    const periodEntries = allEntries.filter(e => {
      const d = String(e.date).slice(0, 10);
      return d >= pStart && d <= pEnd;
    });
    const actualMap = {};
    periodEntries.forEach(e => {
      actualMap[e.metric_id] = (actualMap[e.metric_id] || 0) + Number(e.value);
    });
    const remainingDays = todayStr2 <= pEnd
      ? Math.max(1, Math.round((new Date(pEnd) - new Date(todayStr2)) / 86400000) + 1)
      : 0;
    if (remainingDays === 0) return;
    metrics.forEach(m => {
      if (m.is_inverse) return;
      const tgt = targets.find(t => t.metric_id === m.id);
      if (!tgt) return;
      const actual = actualMap[m.id] || 0;
      const pct = pacePercent(actual, tgt.weekly_target, pd.period, false);
      if (pct === null || pct >= 70) return;
      const needPerDay = Math.ceil((tgt.weekly_target - actual) / remainingDays);
      if (needPerDay <= 0) return;
      smartAlerts.push({
        projName: proj.name,
        metricName: m.name,
        needPerDay,
        remainingDays,
        pct,
      });
    });
  });
  smartAlerts.sort((a, b) => a.pct - b.pct);

  return (
    <div className="min-h-full bg-stone-50">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{t('dashboardTitle')}</h1>
          <p className="text-sm text-stone-400 mt-1 capitalize">{today}</p>
        </div>

        {/* Summary bar */}
        {loaded.length > 0 && (onTrackCount > 0 || behindCount > 0) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {onTrackCount > 0 && (
              <div className="flex items-center gap-2 bg-white border border-stone-100 shadow-sm rounded-xl px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-[#1D9E75]" />
                <span className="text-sm font-medium text-stone-700">
                  {onTrackCount} on track
                </span>
              </div>
            )}
            {behindCount > 0 && (
              <div className="flex items-center gap-2 bg-white border border-stone-100 shadow-sm rounded-xl px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-[#E24B4A]" />
                <span className="text-sm font-medium text-stone-700">
                  {behindCount} behind pace
                </span>
              </div>
            )}
            {campaignBehindCount > 0 && (
              <div className="flex items-center gap-2 bg-white border border-stone-100 shadow-sm rounded-xl px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-[#EF9F27]" />
                <span className="text-sm font-medium text-stone-700">
                  {campaignBehindCount} behind campaign
                </span>
              </div>
            )}
          </div>
        )}

        {/* Entry nudge bar */}
        {missingTodayEntry && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-5 text-sm text-amber-800">
            <span>⏰</span>
            <span>Don't forget to log today's numbers</span>
          </div>
        )}

        {/* Smart alerts */}
        {smartAlerts.length > 0 && (
          <div className="bg-[#FCEBEB] border border-[#E24B4A] rounded-xl px-4 py-3 mb-5 space-y-1">
            {smartAlerts.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-[#791F1F]">
                <span>⚠️</span>
                <span>
                  <span className="font-semibold">{a.projName} · {a.metricName}</span>
                  {' — '}need {a.needPerDay}/day for {a.remainingDays} day{a.remainingDays !== 1 ? 's' : ''} to hit target
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Project grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PROJECTS.map(p => {
            const pd = projectData[p.id];
            if (!pd || pd.loading) return <CardSkeleton key={p.id} color={p.color} />;
            return (
              <ProjectCard
                key={p.id}
                project={p}
                period={pd.period}
                data={pd.data}
                periods={pd.periods || []}
              />
            );
          })}
        </div>

      </div>
    </div>
  );
}
