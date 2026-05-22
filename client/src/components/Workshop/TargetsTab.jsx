import { useEffect, useState } from 'react';
import { api } from '../../hooks/useApi.js';
import { dailyTarget, formatNum } from '../../utils/calculations.js';

// Distribution types shown only when editing a campaign/standalone period
const DIST_OPTIONS = [
  { value: 'campaign', label: 'Campaign total' },
  { value: 'regular',  label: 'Per sub-period' },
];

function genId(projectId, name) {
  return `${projectId}_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
}

export default function TargetsTab({
  periods,
  activePeriod,
  projects,
  selectedProject,
  onProjectChange,
}) {
  const projectList = projects;

  const [periodList, setPeriodList]             = useState(periods);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [metrics, setMetrics]                   = useState([]);
  const [targets, setTargets]                   = useState({});   // metricId → input value
  const [types, setTypes]                       = useState({});   // metricId → 'campaign'|'regular'
  const [inverses, setInverses]                 = useState({});   // metricId → bool
  const [campaignTotals, setCampaignTotals]     = useState({});   // metricId → campaign-level total
  const [saving, setSaving]                     = useState(false);
  const [saveOk, setSaveOk]                     = useState(false);
  const [error, setError]                       = useState(null);
  const [addingMetric, setAddingMetric]         = useState(false);
  const [newMetric, setNewMetric]               = useState({ name: '', target: '', is_inverse: false });
  const [confirmDelete, setConfirmDelete]       = useState(null);
  const [copySource, setCopySource]             = useState(null); // { period, targets: [] } | null
  const [copying, setCopying]                   = useState(false);
  const [reloadCounter, setReloadCounter]       = useState(0);

  // Sync period list and default to the active week
  useEffect(() => {
    setPeriodList(periods);
    if (!periods.length) { setSelectedPeriodId(''); return; }
    const today = new Date().toISOString().slice(0, 10);
    const activeWeek = periods.find(p =>
      p.parent_id &&
      String(p.start_date).slice(0, 10) <= today &&
      String(p.end_date).slice(0, 10)   >= today
    );
    const pick = activeWeek || activePeriod || periods[0];
    setSelectedPeriodId(pick?.id || '');
  }, [periods, activePeriod]);

  const period       = periodList.find(p => p.id === selectedPeriodId);
  // campaignPeriod = parent if the selected period is a sub-period
  const campaignPeriod = period?.parent_id
    ? periodList.find(p => p.id === period.parent_id)
    : null;
  const isSubPeriod    = !!campaignPeriod;

  // All sibling sub-periods (for remaining-budget hint and count)
  const siblingPeriods = campaignPeriod
    ? periodList.filter(p => p.parent_id === campaignPeriod.id)
    : [];
  // Estimate total sub-periods (same logic as ProjectPage)
  const avgDays = siblingPeriods.length > 0
    ? siblingPeriods.reduce((s, w) =>
        s + Math.ceil((new Date(String(w.end_date).slice(0,10)) - new Date(String(w.start_date).slice(0,10))) / 86400000) + 1,
      0) / siblingPeriods.length
    : 7;
  const campDays = campaignPeriod
    ? Math.ceil((new Date(String(campaignPeriod.end_date).slice(0,10)) - new Date(String(campaignPeriod.start_date).slice(0,10))) / 86400000) + 1
    : 0;
  const estimatedSubPeriods = campDays > 0
    ? Math.max(siblingPeriods.length, Math.round(campDays / avgDays))
    : (siblingPeriods.length || 1);

  // Load metrics + targets when project/period changes
  useEffect(() => {
    if (!selectedProject || !selectedPeriodId) return;
    let cancelled = false;
    const selPeriod = periodList.find(p => p.id === selectedPeriodId);
    const parentId  = selPeriod?.parent_id || null;

    Promise.all([
      api.getMetrics(selectedProject),
      api.getTargets({ project_id: selectedProject, period_id: selectedPeriodId }),
      parentId
        ? api.getTargets({ project_id: selectedProject, period_id: parentId })
        : Promise.resolve([]),
    ]).then(([m, t, campaignT]) => {
      setCopySource(null); // reset on every load
      setMetrics(m);

      const tMap    = {};
      const typeMap = {};
      const invMap  = {};
      const cTotals = {};

      const campaignTMap = {};
      campaignT.forEach(ct => { campaignTMap[ct.metric_id] = ct.weekly_target; });

      // Estimate sub-period count inside the effect (needed for stale-override guard)
      const sibWks = parentId ? periodList.filter(p => p.parent_id === parentId) : [];
      const camp   = parentId ? periodList.find(p => p.id === parentId) : null;
      const avgWk  = sibWks.length > 0
        ? sibWks.reduce((s, w) =>
            s + Math.ceil((new Date(String(w.end_date).slice(0,10)) - new Date(String(w.start_date).slice(0,10))) / 86400000) + 1,
          0) / sibWks.length
        : 7;
      const cDays  = camp
        ? Math.ceil((new Date(String(camp.end_date).slice(0,10)) - new Date(String(camp.start_date).slice(0,10))) / 86400000) + 1
        : 0;
      const numEst = cDays > 0 ? Math.max(sibWks.length, Math.round(cDays / avgWk)) : (sibWks.length || 1);

      m.forEach(metric => {
        typeMap[metric.id] = metric.type === 'campaign' ? 'campaign' : 'regular';
        invMap[metric.id]  = !!metric.is_inverse;

        if (metric.type === 'campaign') {
          if (parentId) {
            const campaignTotal = campaignTMap[metric.id] ?? 0;
            cTotals[metric.id]  = campaignTotal;
            const computedShare = campaignTotal > 0 ? Math.ceil(campaignTotal / numEst) : '';
            const weekOverride  = t.find(x => x.metric_id === metric.id)?.weekly_target;
            const isStale = weekOverride != null && weekOverride === campaignTotal && numEst > 1;
            tMap[metric.id] = (!isStale && weekOverride != null) ? weekOverride : computedShare;
          } else {
            const campaignTotal = t.find(x => x.metric_id === metric.id)?.weekly_target ?? 0;
            cTotals[metric.id]  = campaignTotal;
            tMap[metric.id]     = campaignTotal;
          }
        } else {
          tMap[metric.id] = t.find(x => x.metric_id === metric.id)?.weekly_target ?? '';
        }
      });

      setTargets(tMap);
      setTypes(typeMap);
      setInverses(invMap);
      setCampaignTotals(cTotals);

      // Check if we should offer copy-forward
      const hasAnyTarget = m.some(metric =>
        t.find(x => x.metric_id === metric.id && x.period_id === selectedPeriodId && x.weekly_target > 0)
      );
      if (!hasAnyTarget && m.length > 0) {
        const selPer = periodList.find(p => p.id === selectedPeriodId);
        const sameLevel = selPer?.parent_id
          ? periodList.filter(p => p.parent_id === selPer.parent_id)
          : periodList.filter(p => !p.parent_id);
        const sorted = [...sameLevel].sort((a, b) =>
          String(a.start_date).localeCompare(String(b.start_date))
        );
        const idx = sorted.findIndex(p => p.id === selectedPeriodId);
        const prev = idx > 0 ? sorted[idx - 1] : null;
        if (prev) {
          api.getTargets({ project_id: selectedProject, period_id: prev.id }).then(prevTargets => {
            if (cancelled) return;
            if (prevTargets.length > 0) {
              setCopySource({ period: prev, targets: prevTargets });
            } else {
              setCopySource(null);
            }
          }).catch(() => { if (!cancelled) setCopySource(null); });
        } else {
          setCopySource(null);
        }
      } else {
        setCopySource(null);
      }
    }).catch(e => setError(e.message));
    return () => { cancelled = true; };
  }, [selectedProject, selectedPeriodId, periodList, reloadCounter]);

  const handleTargetChange = (metricId, val) =>
    setTargets(t => ({ ...t, [metricId]: val }));

  const handleTypeChange = async (metricId, type) => {
    setTypes(t => ({ ...t, [metricId]: type }));
    await api.updateMetric(metricId, { type }).catch(e => setError(e.message));
  };

  const handleInverseToggle = async (metricId) => {
    const next = !inverses[metricId];
    setInverses(i => ({ ...i, [metricId]: next }));
    await api.updateMetric(metricId, { is_inverse: next }).catch(e => setError(e.message));
  };

  const handleSave = async () => {
    setSaving(true); setError(null); setSaveOk(false);
    try {
      await Promise.all(
        metrics.map(m =>
          api.upsertTarget({
            metric_id:     m.id,
            period_id:     selectedPeriodId,
            weekly_target: Number(targets[m.id] || 0),
          })
        )
      );
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMetric = async (metric) => {
    try {
      await api.deleteMetric(metric.id);
      setMetrics(m => m.filter(x => x.id !== metric.id));
      setConfirmDelete(null);
    } catch (e) { setError(e.message); }
  };

  const handleAddMetric = async () => {
    if (!newMetric.name) return;
    const id = genId(selectedProject, newMetric.name);
    try {
      const created = await api.createMetric({
        id,
        project_id:  selectedProject,
        name:        newMetric.name,
        type:        'regular',
        is_inverse:  newMetric.is_inverse,
        sort_order:  metrics.length + 1,
      });
      if (newMetric.target) {
        await api.upsertTarget({
          metric_id:     id,
          period_id:     selectedPeriodId,
          weekly_target: Number(newMetric.target),
        });
      }
      setMetrics(m => [...m, created]);
      setTargets(t => ({ ...t, [id]: newMetric.target }));
      setTypes(t => ({ ...t, [id]: 'regular' }));
      setInverses(i => ({ ...i, [id]: newMetric.is_inverse }));
      setNewMetric({ name: '', target: '', is_inverse: false });
      setAddingMetric(false);
    } catch (e) { setError(e.message); }
  };

  async function handleCopyTargets() {
    if (!copySource || copying) return;
    setCopying(true);
    try {
      await Promise.all(
        copySource.targets.map(ct =>
          api.upsertTarget({
            metric_id:     ct.metric_id,
            period_id:     selectedPeriodId,
            weekly_target: ct.weekly_target,
          })
        )
      );
      // Trigger full effect re-run so all state (targets, types, inverses, campaignTotals) refreshes
      setReloadCounter(c => c + 1);
    } catch (err) {
      setError('Failed to copy targets. Please try again.');
    } finally {
      setCopying(false);
    }
  }

  // ── Period dropdown groups ────────────────────────────────────────────────
  const campaigns = periodList.filter(p => !p.parent_id);
  const weeks     = periodList.filter(p =>  p.parent_id);
  const campaignHasWeeks = (cId) => weeks.some(w => w.parent_id === cId);
  const noPeriods    = periodList.length === 0;
  const noSelectable = periodList.length === 0;

  // ── Remaining budget hint for sub-period ─────────────────────────────────
  const remainingHint = (metricId) => {
    if (!isSubPeriod || types[metricId] !== 'campaign') return null;
    const total    = campaignTotals[metricId] || 0;
    const thisVal  = Number(targets[metricId] || 0);
    const others   = estimatedSubPeriods - 1;
    const remaining = Math.max(0, total - thisVal);
    const perOther  = others > 0 ? Math.ceil(remaining / others) : 0;
    return `Campaign: ${formatNum(total)} · You set ${formatNum(thisVal)} · ${formatNum(remaining)} left for ${others} other sub-period${others !== 1 ? 's' : ''} (${formatNum(perOther)} each)`;
  };

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

      {/* Period selector */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">
          Targets for {projectList.find(p => p.id === selectedProject)?.name}
        </h2>
        {noPeriods ? (
          <span className="text-sm text-stone-400 italic">
            No periods — create them in the <strong>Periods</strong> tab first.
          </span>
        ) : (
          <select
            value={selectedPeriodId}
            onChange={e => setSelectedPeriodId(e.target.value)}
            className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-stone-300"
          >
            {campaigns.filter(c => campaignHasWeeks(c.id)).map(campaign => (
              <optgroup key={campaign.id} label={`📅 ${campaign.name}`}>
                <option value={campaign.id}>
                  {campaign.name} – full campaign ({String(campaign.start_date).slice(0, 10)} – {String(campaign.end_date).slice(0, 10)})
                </option>
                {weeks
                  .filter(w => w.parent_id === campaign.id)
                  .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
                  .map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({String(w.start_date).slice(0, 10)} – {String(w.end_date).slice(0, 10)})
                    </option>
                  ))}
              </optgroup>
            ))}
            {campaigns.filter(c => !campaignHasWeeks(c.id)).length > 0 && (
              <optgroup label="Standalone periods">
                {campaigns.filter(c => !campaignHasWeeks(c.id)).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({String(p.start_date).slice(0, 10)} – {String(p.end_date).slice(0, 10)})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
      </div>

      {error && (
        <div className="bg-[#FCEBEB] border border-[#E24B4A] rounded-lg px-4 py-3 text-sm text-[#791F1F]">
          {error}
        </div>
      )}
      {saveOk && (
        <div className="bg-[#E1F5EE] border border-[#1D9E75] rounded-lg px-4 py-3 text-sm text-[#085041]">
          Targets saved.
        </div>
      )}

      {/* Context label */}
      {selectedPeriodId && period && (
        <div className="text-xs text-stone-400">
          {isSubPeriod ? (
            <>
              Editing <strong className="text-stone-600">{period.name}</strong>
              {' '}({String(period.start_date).slice(0, 10)} – {String(period.end_date).slice(0, 10)})
              {' '}· part of <span className="text-stone-500">{campaignPeriod?.name}</span>
            </>
          ) : (
            <>
              Setting campaign totals for <strong className="text-stone-600">{period.name}</strong>
              {' '}— auto-splits across {estimatedSubPeriods} sub-period{estimatedSubPeriods !== 1 ? 's' : ''}
            </>
          )}
        </div>
      )}

      {/* Copy-forward button */}
      {copySource && (
        <button
          type="button"
          onClick={handleCopyTargets}
          disabled={copying}
          className="flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 mb-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>←</span>
          <span>{copying ? 'Copying…' : `Copy targets from ${copySource.period.name || 'previous period'}`}</span>
        </button>
      )}

      {/* ── CAMPAIGN VIEW ── set totals + distribution type + inverse ── */}
      {selectedPeriodId && !noSelectable && !isSubPeriod && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="text-left px-4 py-2.5 text-stone-500 font-medium">Metric</th>
                <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Daily equiv</th>
                <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Target</th>
                <th className="text-center px-3 py-2.5 text-stone-500 font-medium" title="Lower is better">↕</th>
                <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Distribution</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => {
                const wt = Number(targets[m.id] || 0);
                const dt = period ? dailyTarget(wt, period) : 0;
                return (
                  <tr key={m.id} className="border-b border-stone-100">
                    <td className="px-4 py-2.5 text-stone-700">{m.name}</td>
                    <td className="px-4 py-2.5 text-right text-stone-400 text-xs">{formatNum(dt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number" min="0"
                        value={targets[m.id] ?? ''}
                        onChange={e => handleTargetChange(m.id, e.target.value)}
                        className="w-28 text-right border border-stone-200 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-stone-300"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => handleInverseToggle(m.id)}
                        title={inverses[m.id] ? 'Lower is better (click to toggle)' : 'Higher is better (click to toggle)'}
                        className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                          inverses[m.id]
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                        }`}
                      >
                        {inverses[m.id] ? '↓' : '↑'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <select
                        value={types[m.id] || 'regular'}
                        onChange={e => handleTypeChange(m.id, e.target.value)}
                        className="text-xs border border-stone-200 rounded-md px-2 py-1 outline-none"
                      >
                        {DIST_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {confirmDelete === m.id ? (
                        <div className="flex gap-1 text-xs">
                          <span className="text-stone-500">Delete?</span>
                          <button onClick={() => handleDeleteMetric(m)} className="text-[#E24B4A] underline">Yes</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-stone-400 underline">No</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(m.id)}
                          className="text-stone-300 hover:text-[#E24B4A] transition-colors text-xs"
                        >✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Add metric row */}
              {addingMetric ? (
                <tr className="border-b border-stone-100 bg-stone-50">
                  <td className="px-4 py-2">
                    <input
                      type="text" placeholder="Metric name" autoFocus
                      value={newMetric.name}
                      onChange={e => setNewMetric(n => ({ ...n, name: e.target.value }))}
                      className="w-full border border-stone-200 rounded px-2 py-1 text-sm outline-none"
                    />
                  </td>
                  <td className="px-4 py-2 text-right text-stone-300 text-xs">—</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number" min="0" placeholder="Target"
                      value={newMetric.target}
                      onChange={e => setNewMetric(n => ({ ...n, target: e.target.value }))}
                      className="w-28 text-right border border-stone-200 rounded px-2 py-1 text-sm outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setNewMetric(n => ({ ...n, is_inverse: !n.is_inverse }))}
                      className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                        newMetric.is_inverse
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-stone-100 text-stone-400'
                      }`}
                    >
                      {newMetric.is_inverse ? '↓' : '↑'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right text-stone-400 text-xs">regular</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={handleAddMetric} className="text-xs px-2 py-1 bg-stone-800 text-white rounded">Add</button>
                      <button onClick={() => setAddingMetric(false)} className="text-xs px-2 py-1 border border-stone-200 rounded text-stone-500">Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-2">
                    <button
                      onClick={() => setAddingMetric(true)}
                      className="text-sm text-stone-400 hover:text-stone-600 flex items-center gap-1"
                    >
                      <span className="text-lg leading-none">+</span> Add metric
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SUB-PERIOD VIEW ── just target + inverse indicator ── */}
      {selectedPeriodId && !noSelectable && isSubPeriod && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="text-left px-4 py-2.5 text-stone-500 font-medium">Metric</th>
                <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Daily equiv</th>
                <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Target</th>
                <th className="text-center px-3 py-2.5 text-stone-400 font-medium" title="Direction">↕</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => {
                const wt   = Number(targets[m.id] || 0);
                const dt   = period ? dailyTarget(wt, period) : 0;
                const hint = remainingHint(m.id);
                return (
                  <tr key={m.id} className="border-b border-stone-100">
                    <td className="px-4 py-2.5 text-stone-700">{m.name}</td>
                    <td className="px-4 py-2.5 text-right text-stone-400 text-xs">{formatNum(dt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <input
                          type="number" min="0"
                          value={targets[m.id] ?? ''}
                          onChange={e => handleTargetChange(m.id, e.target.value)}
                          className="w-28 text-right border border-stone-200 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-stone-300"
                        />
                        {hint && (
                          <span className="text-[10px] text-stone-400 italic leading-tight text-right max-w-xs">
                            {hint}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {/* Direction indicator — read-only in sub-period view */}
                      <span
                        title={inverses[m.id] ? 'Lower is better' : 'Higher is better'}
                        className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold ${
                          inverses[m.id]
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-stone-100 text-stone-400'
                        }`}
                      >
                        {inverses[m.id] ? '↓' : '↑'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {confirmDelete === m.id ? (
                        <div className="flex gap-1 text-xs">
                          <span className="text-stone-500">Delete?</span>
                          <button onClick={() => handleDeleteMetric(m)} className="text-[#E24B4A] underline">Yes</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-stone-400 underline">No</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(m.id)}
                          className="text-stone-300 hover:text-[#E24B4A] transition-colors text-xs"
                        >✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Save */}
      {selectedPeriodId && !noSelectable && (
        <>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save targets'}
            </button>
            <button
              onClick={() => window.history.back()}
              className="px-5 py-2 border border-stone-200 rounded-lg text-sm text-stone-600 hover:border-stone-400"
            >
              Back to data
            </button>
          </div>
          {isSubPeriod ? (
            <p className="text-xs text-stone-400 italic">
              Editing targets for <strong>{period?.name}</strong> only.
              Campaign-type targets auto-distribute the remaining budget across other sub-periods.
              Change the distribution type from the <strong>full campaign</strong> view.
            </p>
          ) : (
            <p className="text-xs text-stone-400 italic">
              <strong>Campaign total</strong> = one number for the full campaign, split evenly across sub-periods. ·{' '}
              <strong>Per sub-period</strong> = set the target individually for each sub-period. ·{' '}
              <strong>↑ / ↓</strong> = direction (↓ means lower is better, e.g. churn).
            </p>
          )}
        </>
      )}
    </div>
  );
}
