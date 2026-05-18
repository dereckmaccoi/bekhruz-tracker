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

/** All calendar dates from start to end (inclusive) */
function getDaysInRange(start, end) {
  const days = [];
  let cur = start.slice(0, 10);
  const last = end.slice(0, 10);
  while (cur <= last) { days.push(cur); cur = addDays(cur, 1); }
  return days;
}

/** Color-code a cell vs its daily target */
function cellStyle(value, dailyTgt, isInverse) {
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

export default function DataTab({ periods, activePeriod, onSaved, selectedProject, onProjectChange, projects }) {
  const { t } = useLang();
  const today = toISODate(new Date());

  const projectList = projects || [];
  // Active project: controlled from parent (Workshop)
  const activeProject = selectedProject || projectList[0]?.id;
  const activeProj    = projectList.find(p => p.id === activeProject);

  // displayPeriod drives the grid — follows activePeriod by default
  const [displayPeriod, setDisplayPeriod] = useState(null);
  const [allMetrics, setAllMetrics]       = useState([]);
  const [allTargets, setAllTargets]       = useState([]);
  const [dbEntries, setDbEntries]         = useState({}); // { date: { metricId: value } }
  const [edits, setEdits]                 = useState({});
  const [saving, setSaving]               = useState(false);
  const [saveMsg, setSaveMsg]             = useState(null);

  // Sync displayPeriod to activePeriod whenever it changes (project switch or first load)
  useEffect(() => {
    setDisplayPeriod(activePeriod || null);
  }, [activePeriod?.id]);

  // Sorted periods for prev/next navigation
  const sortedPeriods = [...(periods || [])]
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const currentIdx  = sortedPeriods.findIndex(p => p.id === displayPeriod?.id);
  const prevPeriod  = sortedPeriods[currentIdx - 1] ?? null;
  const nextPeriod  = sortedPeriods[currentIdx + 1] ?? null;
  // Don't allow navigating into fully-future periods
  const canGoNext   = nextPeriod && nextPeriod.start_date.slice(0, 10) <= today;

  // Days to show = every day in the displayPeriod
  const periodDays = displayPeriod
    ? getDaysInRange(displayPeriod.start_date, displayPeriod.end_date)
    : [];

  const months  = t('months');
  const shortM  = months.map(m => m.slice(0, 3));
  const days    = t('days'); // ['Mo','Tu','We',…]

  // Period label e.g. "H1 W18  ·  4–10 May 2026"
  const periodLabel = displayPeriod ? (() => {
    const s = new Date(displayPeriod.start_date.slice(0, 10) + 'T12:00:00');
    const e = new Date(displayPeriod.end_date.slice(0, 10) + 'T12:00:00');
    const range = s.getMonth() === e.getMonth()
      ? `${s.getDate()}–${e.getDate()} ${shortM[e.getMonth()]} ${e.getFullYear()}`
      : `${s.getDate()} ${shortM[s.getMonth()]} – ${e.getDate()} ${shortM[e.getMonth()]} ${e.getFullYear()}`;
    return `${displayPeriod.name}  ·  ${range}`;
  })() : '—';

  // ── Load metrics (once, all projects — needed for the filled/possible counts) ──
  useEffect(() => {
    api.getMetrics().then(setAllMetrics);
  }, []);

  // ── Load targets + entries when displayPeriod or project changes ──────────
  useEffect(() => {
    if (!displayPeriod) return;
    setEdits({});
    // Fetch entries by date range rather than period_id — old entries may have
    // been saved under a different period_id (before per-project periods existed).
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

  // ── Cell helpers ──────────────────────────────────────────────────────
  const getVal = (date, metricId) => {
    if (edits[date]?.[metricId] !== undefined) return edits[date][metricId];
    return dbEntries[date]?.[metricId] ?? '';
  };

  const handleCell = (date, metricId, value) => {
    setEdits(prev => ({ ...prev, [date]: { ...(prev[date] || {}), [metricId]: value } }));
    setSaveMsg(null);
  };

  // ── Save ──────────────────────────────────────────────────────────────
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
      // Merge edits → db
      setDbEntries(prev => {
        const next = { ...prev };
        Object.entries(edits).forEach(([date, dayEdits]) => {
          next[date] = { ...(next[date] || {}), ...dayEdits };
        });
        return next;
      });
      setEdits({});
      setSaveMsg('saved');
      onSaved?.();
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg('error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Ctrl+Enter
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSave(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [edits, displayPeriod, activeProject]);

  // ── Derived ───────────────────────────────────────────────────────────
  const projectMetrics = allMetrics.filter(m => m.project_id === activeProject);
  const targetMap      = Object.fromEntries(allTargets.map(tg => [tg.metric_id, tg]));
  const dirtyCount     = Object.values(edits).reduce((s, d) => s + Object.keys(d).length, 0);

  const weekTotals = projectMetrics.map(m =>
    periodDays.reduce((sum, date) => {
      const v = getVal(date, m.id);
      return sum + (v !== '' ? Number(v) : 0);
    }, 0)
  );

  // Day-of-week index (0=Mon … 6=Sun) for the days label
  function dayIdx(dateStr) {
    const d = new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun
    return (d + 6) % 7; // 0=Mon
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Project tabs ───────────────────────────────────────────── */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {projectList.map(p => {
          const isActive  = activeProject === p.id;
          const pMetrics  = allMetrics.filter(m => m.project_id === p.id);
          const filled    = pMetrics.reduce((n, m) =>
            n + periodDays.filter(d => d <= today && getVal(d, m.id) !== '').length, 0);
          const possible  = pMetrics.length * periodDays.filter(d => d <= today).length;
          return (
            <button
              key={p.id}
              onClick={() => onProjectChange?.(p.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                isActive
                  ? 'text-white border-transparent'
                  : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700'
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

      {/* ── No periods notice ──────────────────────────────────────── */}
      {periods.length === 0 && (
        <div className="text-sm text-stone-400 italic py-4 text-center">
          No periods set for this project — go to Targets → Manage periods to add one.
        </div>
      )}

      {/* ── Period navigation ──────────────────────────────────────── */}
      {periods.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => prevPeriod && setDisplayPeriod(prevPeriod)}
              disabled={!prevPeriod}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-500 disabled:opacity-25 transition-colors text-base"
            >←</button>
            <span className="text-sm font-semibold text-stone-700">{periodLabel}</span>
            <button
              onClick={() => canGoNext && setDisplayPeriod(nextPeriod)}
              disabled={!canGoNext}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-500 disabled:opacity-25 transition-colors text-base"
            >→</button>
          </div>

          {/* ── Grid ───────────────────────────────────────────────────── */}
          <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="py-2.5 pl-4 pr-2 text-left text-xs font-semibold text-stone-400 uppercase tracking-wide w-20">
                    Day
                  </th>
                  {projectMetrics.map(m => {
                    const tgt = targetMap[m.id];
                    const dt  = tgt && displayPeriod ? dailyTarget(tgt.weekly_target, displayPeriod) : 0;
                    return (
                      <th key={m.id} className="py-2.5 px-3 text-right text-xs font-semibold text-stone-700 min-w-[100px]">
                        <div className="uppercase tracking-wide">{m.name}</div>
                        {dt > 0 && (
                          <div className="text-[10px] font-normal text-stone-400 normal-case tracking-normal">
                            {m.type === 'inverse' ? '≤' : '~'}{formatNum(dt)}/day
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {periodDays.map(date => {
                  const isFuture = date > today;
                  const isToday  = date === today;
                  const di       = dayIdx(date);
                  const dateObj  = new Date(date + 'T12:00:00');

                  return (
                    <tr
                      key={date}
                      className={`border-b border-stone-100 last:border-b-0 ${
                        isToday ? 'bg-stone-50' : isFuture ? '' : 'hover:bg-stone-50/60'
                      }`}
                    >
                      <td className="py-1.5 pl-4 pr-2 w-20">
                        <div className="flex items-center gap-1.5">
                          {isToday && (
                            <span className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: activeProj?.color }} />
                          )}
                          <span className={`text-xs font-medium ${
                            isToday ? 'text-stone-800' : isFuture ? 'text-stone-300' : 'text-stone-500'
                          }`}>
                            {days[di]}
                          </span>
                          <span className={`text-xs ${
                            isToday ? 'font-bold text-stone-800' : isFuture ? 'text-stone-300' : 'text-stone-400'
                          }`}>
                            {dateObj.getDate()}
                          </span>
                        </div>
                      </td>

                      {projectMetrics.map(m => {
                        const tgt   = targetMap[m.id];
                        const dt    = tgt && displayPeriod ? dailyTarget(tgt.weekly_target, displayPeriod) : 0;
                        const val   = getVal(date, m.id);
                        const cs    = (!isFuture && val !== '') ? cellStyle(val, dt, m.type === 'inverse') : null;
                        const dirty = edits[date]?.[m.id] !== undefined;

                        return (
                          <td key={m.id} className="py-1 px-2">
                            <input
                              type="number"
                              min="0"
                              value={val}
                              disabled={isFuture}
                              onChange={e => handleCell(date, m.id, e.target.value)}
                              onFocus={e => e.target.select()}
                              style={
                                cs    ? { backgroundColor: cs.bg, color: cs.text, borderColor: 'transparent' } :
                                dirty ? { borderColor: activeProj?.color, boxShadow: `0 0 0 2px ${activeProj?.color}22` } :
                                {}
                              }
                              className={`w-full text-right text-sm rounded-md px-2 py-1.5 border outline-none transition-all
                                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                                ${isFuture
                                  ? 'bg-transparent border-transparent text-stone-300 cursor-not-allowed'
                                  : cs || dirty
                                    ? 'border-transparent'
                                    : 'border-stone-200 bg-white hover:border-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-200'
                                }`}
                              placeholder={isFuture ? '' : '—'}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-stone-200 bg-stone-50">
                  <td className="py-2.5 pl-4 pr-2 text-xs font-bold text-stone-500 uppercase tracking-wide">
                    Total
                  </td>
                  {projectMetrics.map((m, i) => {
                    const tgt   = targetMap[m.id];
                    const wt    = tgt?.weekly_target ?? 0;
                    const total = weekTotals[i];
                    const good  = wt === 0 ? null : m.type === 'inverse' ? total <= wt : total >= wt;
                    return (
                      <td key={m.id} className="py-2.5 px-3 text-right">
                        <span className="text-sm font-bold"
                          style={{ color: good === null ? '#57534e' : good ? '#085041' : '#791F1F' }}>
                          {formatNum(total)}
                        </span>
                        {wt > 0 && (
                          <span className="text-[10px] text-stone-400 ml-1">/ {formatNum(wt)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Save bar ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-4 mt-1">
            <div className="text-xs text-stone-400">
              {saveMsg === 'saved'
                ? '✓ Saved'
                : saveMsg
                ? <span className="text-[#791F1F]">{saveMsg}</span>
                : dirtyCount > 0
                ? `${dirtyCount} unsaved change${dirtyCount !== 1 ? 's' : ''}`
                : t('ctrlEnterHint')}
            </div>
            <button
              onClick={doSave}
              disabled={saving}
              style={dirtyCount > 0 && !saving ? { backgroundColor: activeProj?.color } : {}}
              className="px-5 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving ? t('saving') : `${t('saveAll')} · ${displayPeriod?.name ?? ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
