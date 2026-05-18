import { useEffect, useState } from 'react';
import { api } from '../../hooks/useApi.js';
import { formatNum } from '../../utils/calculations.js';

// ── Rolling Redistribution ──────────────────────────────────────────────────
// Shows shortfalls from completed periods and distributes them equally across
// remaining (future) periods. Saves new targets on confirm.

export default function RolloverTab({ periods, selectedProject, projects, onProjectChange }) {
  const projectList = projects;

  const [metrics,    setMetrics]    = useState([]);
  const [allTargets, setAllTargets] = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [savedOk,    setSavedOk]    = useState(false);
  const [error,      setError]      = useState(null);
  const [preview,    setPreview]    = useState(false); // show redistribution preview

  const today = new Date().toISOString().slice(0, 10);

  const sortedPeriods = [...periods].sort((a, b) =>
    String(a.start_date).localeCompare(String(b.start_date))
  );
  const completedPeriods  = sortedPeriods.filter(p => String(p.end_date).slice(0, 10) < today);
  const remainingPeriods  = sortedPeriods.filter(p => String(p.end_date).slice(0, 10) >= today);

  // Load all metrics + targets + entries whenever project changes
  useEffect(() => {
    if (!selectedProject || periods.length === 0) return;
    setLoading(true);
    setPreview(false);
    setSavedOk(false);
    setError(null);

    // Use any period to get all entries (server returns all entries for the project)
    const anyPeriod = sortedPeriods[0];

    Promise.all([
      api.getMetrics(selectedProject),
      api.getTargets({ project_id: selectedProject }),
      api.getProject(selectedProject, anyPeriod.id).then(d => d.entries || []),
    ])
      .then(([m, t, e]) => {
        setMetrics(m);
        setAllTargets(t);
        setAllEntries(e);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedProject, periods]);

  // ── Math ──────────────────────────────────────────────────────────────────
  // For each metric: actual total across completed periods, shortfall, new target
  const getActual = (period, metricId) => {
    const s = String(period.start_date).slice(0, 10);
    const e = String(period.end_date).slice(0, 10);
    return allEntries
      .filter(en => en.metric_id === metricId && String(en.date).slice(0, 10) >= s && String(en.date).slice(0, 10) <= e)
      .reduce((sum, en) => sum + Number(en.value), 0);
  };

  const getTarget = (period, metricId) => {
    // Prefer period-specific target; fall back to parent campaign target
    const t = allTargets.find(t => t.period_id === period.id && t.metric_id === metricId)
           || (period.parent_id
               ? allTargets.find(t => t.period_id === period.parent_id && t.metric_id === metricId)
               : null);
    return t?.weekly_target || 0;
  };

  // Per metric: total shortfall across ALL completed periods
  const metricShortfall = (metricId) => {
    if (metrics.find(m => m.id === metricId)?.type === 'inverse') return 0; // skip inverse metrics
    return completedPeriods.reduce((total, p) => {
      const actual = getActual(p, metricId);
      const wt = getTarget(p, metricId);
      return total + Math.max(0, wt - actual);
    }, 0);
  };

  // Per remaining period: current target + redistributed addition
  const addPerPeriod = (metricId) => {
    const n = remainingPeriods.length;
    if (n === 0) return 0;
    return Math.ceil(metricShortfall(metricId) / n);
  };

  const newTarget = (period, metricId) => {
    const current = getTarget(period, metricId);
    const add = addPerPeriod(metricId);
    return current + add;
  };

  // Has any shortfall to distribute?
  const hasShortfall = metrics.some(m => metricShortfall(m.id) > 0);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleApply = async () => {
    setSaving(true);
    setError(null);
    try {
      const upserts = [];
      for (const p of remainingPeriods) {
        for (const m of metrics) {
          if (m.type === 'inverse') continue;
          const nt = newTarget(p, m.id);
          if (nt > 0) {
            upserts.push(api.upsertTarget({
              metric_id: m.id,
              period_id: p.id,
              weekly_target: nt,
            }));
          }
        }
      }
      await Promise.all(upserts);
      // Refresh targets after save
      const t = await api.getTargets({ project_id: selectedProject });
      setAllTargets(t);
      setSavedOk(true);
      setPreview(false);
      setTimeout(() => setSavedOk(false), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const currentProjectMeta = projectList.find(p => p.id === selectedProject);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 py-6">
        <div className="h-5 bg-stone-100 rounded w-1/3" />
        <div className="h-24 bg-stone-100 rounded" />
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="text-sm text-stone-400 py-8 text-center">
        No periods found for this project. Add periods in the Targets tab first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project pills */}
      <div className="flex gap-2 flex-wrap">
        {projectList.map(p => (
          <button
            key={p.id}
            onClick={() => onProjectChange?.(p.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              selectedProject === p.id
                ? 'text-white border-transparent'
                : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
            }`}
            style={selectedProject === p.id ? { backgroundColor: p.color, borderColor: p.color } : {}}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Explainer */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm text-stone-600 leading-relaxed">
        <p className="font-medium text-stone-800 mb-1">How rolling redistribution works</p>
        <p>
          Any shortfall from <span className="font-medium">completed periods</span> is split equally across
          all <span className="font-medium">remaining periods</span>, and added on top of their current targets.
          This way the overall goal stays on track even after a slow period.
        </p>
      </div>

      {error && (
        <div className="bg-[#FCEBEB] border border-[#E24B4A] rounded-lg px-4 py-3 text-sm text-[#791F1F]">
          {error}
        </div>
      )}
      {savedOk && (
        <div className="bg-[#E1F5EE] border border-[#1D9E75] rounded-lg px-4 py-3 text-sm text-[#085041] font-medium">
          ✓ Targets redistributed and saved.
        </div>
      )}

      {/* ── Completed periods summary ── */}
      <div>
        <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
          Completed periods ({completedPeriods.length})
        </h3>

        {completedPeriods.length === 0 ? (
          <p className="text-sm text-stone-400 italic">No completed periods yet.</p>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 380 }}>
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="text-left px-4 py-2.5 text-stone-500 font-medium">Period</th>
                  {metrics.filter(m => m.type !== 'inverse').map(m => (
                    <th key={m.id} className="text-right px-3 py-2.5 text-stone-500 font-medium">{m.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {completedPeriods.map(p => (
                  <tr key={p.id} className="border-b border-stone-100">
                    <td className="px-4 py-2.5 text-stone-700">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-stone-400">{String(p.start_date).slice(0,10)} – {String(p.end_date).slice(0,10)}</div>
                    </td>
                    {metrics.filter(m => m.type !== 'inverse').map(m => {
                      const actual = getActual(p, m.id);
                      const wt = getTarget(p, m.id);
                      const sf = Math.max(0, wt - actual);
                      const pct = wt > 0 ? Math.round((actual / wt) * 100) : null;
                      const isOk = pct !== null && pct >= 100;
                      return (
                        <td key={m.id} className="px-3 py-2.5 text-right">
                          <div className="text-stone-700">{formatNum(actual)} / {formatNum(wt)}</div>
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            {pct !== null && (
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                isOk
                                  ? 'bg-[#E1F5EE] text-[#085041]'
                                  : sf > 0
                                    ? 'bg-[#FCEBEB] text-[#791F1F]'
                                    : 'bg-stone-100 text-stone-500'
                              }`}>{pct}%</span>
                            )}
                            {sf > 0 && (
                              <span className="text-xs text-stone-400">−{formatNum(sf)}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Totals row */}
                <tr className="border-t-2 border-stone-200 bg-stone-50">
                  <td className="px-4 py-2.5 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Total shortfall
                  </td>
                  {metrics.filter(m => m.type !== 'inverse').map(m => {
                    const sf = metricShortfall(m.id);
                    return (
                      <td key={m.id} className="px-3 py-2.5 text-right">
                        {sf > 0 ? (
                          <span className="text-sm font-semibold text-[#791F1F]">−{formatNum(sf)}</span>
                        ) : (
                          <span className="text-sm text-[#1D9E75] font-medium">✓</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Redistribution preview ── */}
      {remainingPeriods.length > 0 && hasShortfall && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">
              Redistribution → {remainingPeriods.length} remaining period{remainingPeriods.length !== 1 ? 's' : ''}
            </h3>
            {!preview && (
              <button
                onClick={() => setPreview(true)}
                className="text-sm text-stone-500 underline hover:text-stone-700"
              >
                Preview changes
              </button>
            )}
          </div>

          {preview && (
            <>
              <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm" style={{ minWidth: 380 }}>
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200">
                      <th className="text-left px-4 py-2.5 text-stone-500 font-medium">Period</th>
                      {metrics.filter(m => m.type !== 'inverse').map(m => (
                        <th key={m.id} className="text-right px-3 py-2.5 text-stone-500 font-medium">{m.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {remainingPeriods.map(p => (
                      <tr key={p.id} className="border-b border-stone-100">
                        <td className="px-4 py-2.5 text-stone-700">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-stone-400">{String(p.start_date).slice(0,10)} – {String(p.end_date).slice(0,10)}</div>
                        </td>
                        {metrics.filter(m => m.type !== 'inverse').map(m => {
                          const current = getTarget(p, m.id);
                          const add = addPerPeriod(m.id);
                          const nt = newTarget(p, m.id);
                          return (
                            <td key={m.id} className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="text-stone-400 line-through text-xs">{formatNum(current)}</span>
                                {add > 0 && <span className="text-xs text-amber-600">+{formatNum(add)}</span>}
                                <span className="font-semibold text-stone-800">{formatNum(nt)}</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleApply}
                  disabled={saving}
                  className="px-5 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Apply redistribution'}
                </button>
                <button
                  onClick={() => setPreview(false)}
                  className="px-4 py-2 border border-stone-200 rounded-lg text-sm text-stone-500 hover:border-stone-400"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {remainingPeriods.length === 0 && (
        <div className="text-sm text-stone-400 bg-stone-50 rounded-xl px-4 py-6 text-center">
          No remaining periods — nothing to redistribute into.
          <br />
          <span className="text-xs">Add future periods in the Targets tab.</span>
        </div>
      )}

      {!hasShortfall && completedPeriods.length > 0 && (
        <div className="text-sm text-[#085041] bg-[#E1F5EE] border border-[#1D9E75] rounded-xl px-4 py-4 text-center font-medium">
          ✓ No shortfall across completed periods — all targets were met!
        </div>
      )}
    </div>
  );
}
