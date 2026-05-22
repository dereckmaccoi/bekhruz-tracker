import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi.js';
import { pacePercent, weeklyPercent, colorKey, formatNum, COLOR_CLASSES, resolveTarget } from '../utils/calculations.js';
import { useLang } from '../i18n/LangContext.jsx';
import { useProjects } from '../context/ProjectsContext.jsx';

function fmtDate(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  return s.slice(8) + '/' + s.slice(5, 7);
}

function CardSkeleton({ color }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="p-4 animate-pulse space-y-3">
        <div className="flex justify-between items-center">
          <div className="h-4 bg-stone-100 rounded w-24" />
          <div className="h-5 bg-stone-100 rounded-lg w-16" />
        </div>
        <div className="h-2 bg-stone-100 rounded-full" />
        <div className="h-3 bg-stone-50 rounded w-40" />
      </div>
    </div>
  );
}

const LANGS = ['en', 'ru', 'uz'];

function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg shrink-0">
      {LANGS.map(l => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`px-2.5 py-1 text-[11px] rounded-md font-bold transition-all uppercase tracking-wider ${
            lang === l ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-700'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function ProjectCard({ project, period, data, periods = [] }) {
  const navigate = useNavigate();
  const { t } = useLang();

  if (!data || !period) {
    return (
      <div
        className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
        onClick={() => navigate(`/project/${project.id}`)}
      >
        <div className="h-1" style={{ backgroundColor: project.color }} />
        <div className="p-4">
          <div className="font-semibold text-stone-800 text-sm">{project.name}</div>
          <p className="text-xs text-stone-400 mt-1">{t('noTargetsSet')}</p>
        </div>
      </div>
    );
  }

  const { metrics = [], targets = [], entries: allEntries = [] } = data;
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

  // Period-over-period delta badge
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
    const prevEntries = allEntries.filter(e => {
      const d = String(e.date).slice(0, 10);
      return d >= prevStart && d <= prevEnd;
    });
    const prevActualMap = {};
    prevEntries.forEach(e => {
      prevActualMap[e.metric_id] = (prevActualMap[e.metric_id] || 0) + Number(e.value);
    });
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
      popBadge = {
        delta,
        arrow: delta > 5 ? '↑' : delta < -5 ? '↓' : '→',
        sign: delta > 0 ? '+' : '',
        cls: delta > 5
          ? 'bg-[#E1F5EE] text-[#085041] border border-[#1D9E75]'
          : delta < -5
          ? 'bg-[#FCEBEB] text-[#791F1F] border border-[#E24B4A]'
          : 'bg-[#F1EFE8] text-[#444441] border border-stone-300',
      };
    }
  }

  // Campaign progress
  const campaignPeriod = period?.parent_id
    ? (periods || []).find(p => p.id === period.parent_id) ?? null
    : null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const cStart = campaignPeriod ? String(campaignPeriod.start_date).slice(0, 10) : '';
  const cEnd   = campaignPeriod ? String(campaignPeriod.end_date).slice(0, 10) : '';
  const campaignDays = campaignPeriod
    ? Math.round((new Date(cEnd) - new Date(cStart)) / 86400000) + 1
    : 0;
  const campaignElapsed = campaignPeriod
    ? Math.min(campaignDays, Math.max(
        todayStr >= cStart ? 1 : 0,
        Math.round((new Date(Math.min(new Date(todayStr), new Date(cEnd))) - new Date(cStart)) / 86400000) + 1
      ))
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
    return Math.round(((campaignActualMap[m.id] || 0) / tgt.weekly_target) * 100);
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
      className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      onClick={() => navigate(`/project/${project.id}`)}
    >
      <div className="h-1" style={{ backgroundColor: project.color }} />
      <div className="p-4 space-y-2.5">

        {/* Project name + pace badge + delta badge */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-bold text-stone-900 text-sm leading-tight">{project.name}</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {hasTargets && avgPct !== null && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${c.tag}`}>
                {avgPct}% week
              </span>
            )}
            {popBadge && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${popBadge.cls}`}>
                {popBadge.arrow} {popBadge.sign}{popBadge.delta}%
              </span>
            )}
          </div>
        </div>

        {/* Campaign progress bar */}
        {hasTargets && campaignPeriod && avgCampaignPct !== null && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-stone-500">
                {campaignPeriod.name} · {campaignElapsed}/{campaignDays}d
                {projectedPct !== null && ` · →${projectedPct}%`}
              </span>
              <span className={`text-[11px] font-semibold ${cC?.text || ''}`}>{avgCampaignPct}%</span>
            </div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${cC?.bar || 'bg-stone-300'}`}
                style={{ width: `${Math.min(100, avgCampaignPct)}%` }}
              />
            </div>
          </div>
        )}

        {/* Week pace text row */}
        {hasTargets && (
          <div className="flex items-center justify-between text-[11px] text-stone-400">
            <span>{period.name} · {fmtDate(period.start_date)}–{fmtDate(period.end_date)}</span>
            {avgPct !== null && (
              <span className={`font-medium ${
                avgPct >= 90 ? 'text-[#085041]' : avgPct >= 70 ? 'text-[#633806]' : 'text-[#791F1F]'
              }`}>
                {avgPct}% pace
              </span>
            )}
          </div>
        )}

        {/* Fallback bar — only when no campaign period */}
        {hasTargets && !campaignPeriod && (
          <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${c.bar}`}
              style={{ width: `${Math.min(100, avgPct ?? 0)}%` }}
            />
          </div>
        )}

        {!hasTargets && (
          <p className="text-xs text-stone-400">{t('noTargetsSet')}</p>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t, lang } = useLang();
  const { projects: PROJECTS } = useProjects();
  const [summaryData, setSummaryData] = useState(null);
  const [loadError, setLoadError]     = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  useEffect(() => {
    api.getDashboardSummary()
      .then(data => setSummaryData(data))
      .catch(() => setLoadError(true));
  }, []);

  // Build a project-keyed map so ProjectCard can stay unchanged in signature
  const projectData = {};
  if (summaryData) {
    summaryData.forEach(item => {
      projectData[item.project.id] = {
        period:  item.period,
        periods: item.periods,
        data:    { metrics: item.metrics, targets: item.targets, entries: item.entries },
        loading: false,
      };
    });
  }

  const locale = lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-GB';
  const today  = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  const loaded = PROJECTS.filter(p => projectData[p.id]);

  // Summary counts
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

  // Today's entry nudge
  const todayStr = new Date().toISOString().slice(0, 10);
  const isPastNoon = new Date().getHours() >= 12;
  const missingTodayEntry = isPastNoon && loaded.some(proj => {
    const pd = projectData[proj.id];
    if (!pd?.data) return false;
    return !pd.data.entries.some(e => String(e.date).slice(0, 10) === todayStr);
  });

  // Smart alerts — behind-pace metrics with catch-up math
  const allSmartAlerts = [];
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
    const remainingDays = todayStr <= pEnd
      ? Math.max(1, Math.round((new Date(pEnd) - new Date(todayStr)) / 86400000) + 1)
      : 0;
    if (remainingDays === 0) return;
    metrics.forEach(m => {
      if (m.is_inverse) return;
      const tgt = resolveTarget(targets, m.id, pd.period);
      if (!tgt) return;
      const actual = actualMap[m.id] || 0;
      const pct = pacePercent(actual, tgt.weekly_target, pd.period, false);
      if (pct === null || pct >= 70) return;
      const needPerDay = Math.ceil((tgt.weekly_target - actual) / remainingDays);
      if (needPerDay <= 0) return;
      allSmartAlerts.push({ projName: proj.name, metricName: m.name, needPerDay, remainingDays, pct });
    });
  });
  allSmartAlerts.sort((a, b) => a.pct - b.pct);
  const ALERT_CAP = 3;
  const visibleAlerts = showAllAlerts ? allSmartAlerts : allSmartAlerts.slice(0, ALERT_CAP);
  const hiddenAlertCount = allSmartAlerts.length - ALERT_CAP;

  const isLoading = summaryData === null && !loadError;

  return (
    <div className="min-h-full bg-stone-50">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">{t('dashboardTitle')}</h1>
            <p className="text-xs text-stone-400 mt-0.5 capitalize">{today}</p>
          </div>
          <LangSwitcher />
        </div>

        {/* Summary chips */}
        {loaded.length > 0 && (onTrackCount > 0 || behindCount > 0) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {onTrackCount > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-stone-100 shadow-sm rounded-xl px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-[#1D9E75]" />
                <span className="text-xs font-medium text-stone-700">{onTrackCount} on track</span>
              </div>
            )}
            {behindCount > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-stone-100 shadow-sm rounded-xl px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-[#E24B4A]" />
                <span className="text-xs font-medium text-stone-700">{behindCount} behind pace</span>
              </div>
            )}
          </div>
        )}

        {/* Entry nudge */}
        {missingTodayEntry && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4 text-xs text-amber-800">
            <span>⏰</span>
            <span>Don't forget to log today's numbers</span>
          </div>
        )}

        {/* Smart alerts — capped at 3 */}
        {visibleAlerts.length > 0 && (
          <div className="bg-[#FCEBEB] border border-[#E24B4A] rounded-xl px-4 py-3 mb-4 space-y-1">
            {visibleAlerts.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-[#791F1F]">
                <span>⚠️</span>
                <span>
                  <span className="font-semibold">{a.projName} · {a.metricName}</span>
                  {' — '}need {formatNum(a.needPerDay)}/day · {a.remainingDays}d left
                </span>
              </div>
            ))}
            {!showAllAlerts && hiddenAlertCount > 0 && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setShowAllAlerts(true); }}
                className="text-xs text-[#791F1F] underline mt-1"
              >
                +{hiddenAlertCount} more
              </button>
            )}
          </div>
        )}

        {/* Error state */}
        {loadError && (
          <div className="text-center py-10 text-stone-400 text-sm">
            Could not load dashboard — check connection
          </div>
        )}

        {/* Project cards — 1 column on mobile */}
        <div className="grid grid-cols-1 gap-3">
          {PROJECTS.map(p => {
            if (isLoading) return <CardSkeleton key={p.id} color={p.color} />;
            const pd = projectData[p.id];
            return (
              <ProjectCard
                key={p.id}
                project={p}
                period={pd?.period}
                data={pd?.data}
                periods={pd?.periods || []}
              />
            );
          })}
        </div>

      </div>
    </div>
  );
}
