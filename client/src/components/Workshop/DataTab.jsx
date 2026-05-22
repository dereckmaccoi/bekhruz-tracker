import { useEffect, useState } from 'react';
import { api } from '../../hooks/useApi.js';
import { dailyTarget, formatNum } from '../../utils/calculations.js';
import { useLang } from '../../i18n/LangContext.jsx';

function toISODate(d) { return d.toISOString().slice(0, 10); }

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function getDaysInRange(start, end) {
  const days = [];
  let cur = start.slice(0, 10);
  const last = end.slice(0, 10);
  while (cur <= last) { days.push(cur); cur = addDays(cur, 1); }
  return days;
}

function cellBg(value, dailyTgt, isInverse) {
  if (value === '' || value === undefined || value === null) return null;
  const v = Number(value);
  if (isInverse) {
    if (!dailyTgt) return null;
    return v <= dailyTgt ? { bg: '#E1F5EE', text: '#085041' } : { bg: '#FCEBEB', text: '#791F1F' };
  }
  if (!dailyTgt) return null;
  const pct = (v / dailyTgt) * 100;
  if (pct >= 100) return { bg: '#E1F5EE', text: '#085041' };
  if (pct >= 60)  return { bg: '#FAEEDA', text: '#633806' };
  return { bg: '#FCEBEB', text: '#791F1F' };
}

export default function DataTab({ periods, activePeriod, selectedProject, onProjectChange, projects }) {
  const { t } = useLang();
  const today = toISODate(new Date());

  const projectList   = projects || [];
  const activeProject = selectedProject || projectList[0]?.id;
  const activeProj    = projectList.find(p => p.id === activeProject);

  const [displayPeriod, setDisplayPeriod] = useState(null);
  const [allMetrics, setAllMetrics]       = useState([]);
  const [allTargets, setAllTargets]       = useState([]);
  const [dbEntries, setDbEntries]         = useState({});
  const [edits, setEdits]                 = useState({});
  const [saving, setSaving]               = useState(false);
  const [saveMsg, setSaveMsg]             = useState(null);
  // Expanded days: today is open by default; others collapsed
  const [expandedDays, setExpandedDays]   = useState({});

  useEffect(() => {
    setDisplayPeriod(activePeriod || null);
    setExpandedDays({});
  }, [activePeriod?.id]);

  const sortedPeriods = [...(periods || [])].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const currentIdx    = sortedPeriods.findIndex(p => p.id === displayPeriod?.id);
  const prevPeriod    = sortedPeriods[currentIdx - 1] ?? null;
  const nextPeriod    = sortedPeriods[currentIdx + 1] ?? null;
  const canGoNext     = nextPeriod && nextPeriod.start_date.slice(0, 10) <= today;

  const periodDays = displayPeriod
    ? getDaysInRange(displayPeriod.start_date, displayPeriod.end_date)
    : [];

  const shortMonths = t('months').map(m => m.slice(0, 3));
  const dayNames    = t('days');
  function dayIdx(dateStr) {
    const d = new Date(dateStr + 'T12:00:00').getDay();
    return (d + 6) % 7;
  }
  function fmtDay(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return `${dayNames[dayIdx(dateStr)]} ${d.getDate()} ${shortMonths[d.getMonth()]}`;
  }

  const periodLabel = displayPeriod ? (() => {
    const s = new Date(displayPeriod.start_date.slice(0, 10) + 'T12:00:00');
    const e = new Date(displayPeriod.end_date.slice(0, 10) + 'T12:00:00');
    const range = s.getMonth() === e.getMonth()
      ? `${s.getDate()}–${e.getDate()} ${shortMonths[e.getMonth()]} ${e.getFullYear()}`
      : `${s.getDate()} ${shortMonths[s.getMonth()]} – ${e.getDate()} ${shortMonths[e.getMonth()]} ${e.getFullYear()}`;
    return `${displayPeriod.name}  ·  ${range}`;
  })() : '—';

  useEffect(() => { api.getMetrics().then(setAllMetrics); }, []);

  useEffect(() => {
    if (!displayPeriod) return;
    setEdits({});
    Promise.all([
      api.getTargets({ period_id: displayPeriod.id }),
      api.getEntries({
        start_date: displayPeriod.start_date.slice(0, 10),
        end_date:   displayPeriod.end_date.slice(0, 10),
      }),
    ]).then(([tgts, entries]) => {
      setAllTargets(tgts);
      const data = {};
      entries.forEach(e => {
        const d = e.date.slice(0, 10);
        if (!data[d]) data[d] = {};
        data[d][e.metric_id] = String(e.value);
      });
      setDbEntries(data);
    });
  }, [displayPeriod?.id]);

  const getVal = (date, metricId) => {
    if (edits[date]?.[metricId] !== undefined) return edits[date][metricId];
    return dbEntries[date]?.[metricId] ?? '';
  };

  const handleCell = (date, metricId, value) => {
    setEdits(prev => ({ ...prev, [date]: { ...(prev[date] || {}), [metricId]: value } }));
    setSaveMsg(null);
  };

  const doSave = async () => {
    if (!displayPeriod) return;
    setSaving(true);
    setSaveMsg(null);
    const metrics = allMetrics.filter(m => m.project_id === activeProject);
    try {
      const saves = [];
      periodDays.forEach(date => {
        if (date > today) return;
        metrics.forEach(m => {
          const val = getVal(date, m.id);
          if (val !== '' && val !== undefined) {
            saves.push(api.upsertEntry({
              metric_id: m.id, period_id: displayPeriod.id, date, value: Number(val),
            }));
          }
        });
      });
      await Promise.all(saves);
      setDbEntries(prev => {
        const next = { ...prev };
        Object.entries(edits).forEach(([date, dayEdits]) => {
          next[date] = { ...(next[date] || {}), ...dayEdits };
        });
        return next;
      });
      setEdits({});
      setSaveMsg('saved');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg('error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSave(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [edits, displayPeriod, activeProject]);

  const projectMetrics = allMetrics.filter(m => m.project_id === activeProject);
  const targetMap      = Object.fromEntries(allTargets.map(tg => [tg.metric_id, tg]));
  const dirtyCount     = Object.values(edits).reduce((s, d) => s + Object.keys(d).length, 0);

  // Past days sorted newest first (excluding today and future)
  const pastDays = [...periodDays]
    .filter(d => d < today)
    .sort((a, b) => b.localeCompare(a));

  const isExpanded = (date) => {
    if (date === today) return true; // today always open
    return !!expandedDays[date];
  };

  const toggleDay = (date) => {
    if (date === today) return;
    setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));
  };

  // Summary for a day: count of filled metrics / total
  const daySummary = (date) => {
    const filled = projectMetrics.filter(m => getVal(date, m.id) !== '').length;
    return { filled, total: projectMetrics.length };
  };

  const MetricInputGrid = ({ date }) => (
    <div className="grid grid-cols-2 gap-2 pt-2">
      {projectMetrics.map(m => {
        const tgt  = targetMap[m.id];
        const dt   = tgt && displayPeriod ? dailyTarget(tgt.weekly_target, displayPeriod) : 0;
        const val  = getVal(date, m.id);
        const cs   = val !== '' ? cellBg(val, dt, !!m.is_inverse) : null;
        const dirty = edits[date]?.[m.id] !== undefined;
        return (
          <div key={m.id} className="space-y-0.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-stone-500">{m.name}</span>
              {dt > 0 && (
                <span className="text-[10px] text-stone-400">
                  {m.is_inverse ? '≤' : '~'}{formatNum(dt)}/day
                </span>
              )}
            </div>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={val}
              onChange={e => handleCell(date, m.id, e.target.value)}
              onFocus={e => e.target.select()}
              style={
                cs    ? { backgroundColor: cs.bg, color: cs.text, borderColor: 'transparent' } :
                dirty ? { borderColor: activeProj?.color, boxShadow: `0 0 0 2px ${activeProj?.color}22` } :
                {}
              }
              className={`w-full text-right text-sm rounded-lg px-3 py-2 border outline-none transition-all
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                ${cs || dirty
                  ? 'border-transparent'
                  : 'border-stone-200 bg-white focus:border-stone-400 focus:ring-2 focus:ring-stone-100'
                }`}
              placeholder="—"
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      {/* Project pills */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {projectList.map(p => {
          const isActive = activeProject === p.id;
          const pMetrics = allMetrics.filter(m => m.project_id === p.id);
          const filled   = pMetrics.reduce((n, m) =>
            n + periodDays.filter(d => d <= today && getVal(d, m.id) !== '').length, 0);
          const possible = pMetrics.length * periodDays.filter(d => d <= today).length;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onProjectChange?.(p.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                isActive
                  ? 'text-white border-transparent'
                  : 'bg-white text-stone-500 border-stone-200'
              }`}
              style={isActive ? { backgroundColor: p.color, borderColor: p.color } : {}}
            >
              {p.name}
              {possible > 0 && (
                <span className={`ml-1.5 text-xs ${isActive ? 'opacity-70' : 'text-stone-400'}`}>
                  {filled}/{possible}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {periods.length === 0 && (
        <div className="text-sm text-stone-400 italic py-4 text-center">
          No periods set — go to Periods tab to add one.
        </div>
      )}

      {periods.length > 0 && (
        <>
          {/* Period navigation */}
          <div className="flex items-center justify-between mb-4">
            <button type="button"
              onClick={() => prevPeriod && setDisplayPeriod(prevPeriod)}
              disabled={!prevPeriod}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 disabled:opacity-25"
            >←</button>
            <span className="text-sm font-semibold text-stone-700 text-center">{periodLabel}</span>
            <button type="button"
              onClick={() => canGoNext && setDisplayPeriod(nextPeriod)}
              disabled={!canGoNext}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 disabled:opacity-25"
            >→</button>
          </div>

          <div className="space-y-2">
            {/* TODAY — always expanded */}
            {periodDays.includes(today) && (
              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <div className="px-4 pt-3.5 pb-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeProj?.color }} />
                  <span className="text-sm font-bold text-stone-900">Today · {fmtDay(today)}</span>
                </div>
                <div className="px-4 pb-4">
                  <MetricInputGrid date={today} />
                </div>
              </div>
            )}

            {/* Past days — collapsed by default */}
            {pastDays.map(date => {
              const open = isExpanded(date);
              const { filled, total } = daySummary(date);
              const hasDirty = projectMetrics.some(m => edits[date]?.[m.id] !== undefined);
              return (
                <div key={date} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => toggleDay(date)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-stone-400">{open ? '▾' : '▸'}</span>
                      <span className="text-sm font-medium text-stone-700">{fmtDay(date)}</span>
                      {hasDirty && (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeProj?.color }} />
                      )}
                    </div>
                    <span className={`text-xs ${filled === total && total > 0 ? 'text-[#085041]' : 'text-stone-400'}`}>
                      {filled}/{total}
                    </span>
                  </button>
                  {open && (
                    <div className="px-4 pb-4">
                      <MetricInputGrid date={date} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-between pt-4 mt-1">
            <span className="text-xs text-stone-400">
              {saveMsg === 'saved'
                ? '✓ Saved'
                : saveMsg
                ? <span className="text-[#791F1F]">{saveMsg}</span>
                : dirtyCount > 0
                ? `${dirtyCount} unsaved`
                : ''}
            </span>
            <button
              type="button"
              onClick={doSave}
              disabled={saving || dirtyCount === 0}
              style={dirtyCount > 0 && !saving ? { backgroundColor: activeProj?.color } : {}}
              className="px-5 py-2.5 bg-stone-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
            >
              {saving ? t('saving') : `${t('saveAll')} · ${displayPeriod?.name ?? ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
