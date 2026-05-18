import { useEffect, useState } from 'react';
import { api } from '../../hooks/useApi.js';
import { dailyTarget, formatNum } from '../../utils/calculations.js';

const TYPE_OPTIONS = ['daily', 'weekly', 'inverse', 'campaign'];

function genId(projectId, name) {
  return `${projectId}_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
}

export default function TargetsTab({
  periods,           // project-specific periods from Workshop
  activePeriod,      // active period for this project
  projects,          // full project list from server
  selectedProject,   // controlled from Workshop
  onProjectChange,   // callback to switch project in Workshop
}) {
  const projectList = projects;

  const [periodList, setPeriodList]               = useState(periods);
  const [selectedPeriodId, setSelectedPeriodId]   = useState('');
  const [metrics, setMetrics]                     = useState([]);
  const [targets, setTargets]                     = useState({});
  const [types, setTypes]                         = useState({});
  const [saving, setSaving]                       = useState(false);
  const [saveOk, setSaveOk]                       = useState(false);
  const [error, setError]                         = useState(null);
  const [addingMetric, setAddingMetric]           = useState(false);
  const [newMetric, setNewMetric]                 = useState({ name: '', target: '', type: 'daily' });
  const [confirmDelete, setConfirmDelete]         = useState(null);
  const [campaignTotals, setCampaignTotals]       = useState({}); // metric_id → campaign-level total (for hints)

  // Sync period list and pick active period whenever parent reloads
  useEffect(() => {
    setPeriodList(periods);
    if (!periods.length) { setSelectedPeriodId(''); return; }

    // Prefer a week (has parent_id) that is active; fall back to activePeriod
    const today = new Date().toISOString().slice(0, 10);
    const activeWeek = periods.find(p =>
      p.parent_id && String(p.start_date).slice(0, 10) <= today && String(p.end_date).slice(0, 10) >= today
    );
    const pick = activeWeek || activePeriod || periods[0];
    setSelectedPeriodId(pick?.id || '');
  }, [periods, activePeriod]);

  const period = periodList.find(p => p.id === selectedPeriodId);
  // If the selected period is a week (has parent_id), look up the parent campaign
  const campaignPeriod = period?.parent_id
    ? periodList.find(p => p.id === period.parent_id)
    : null;

  // Estimate total sub-periods in the campaign (for per-week target hints).
  // Same estimation logic as ProjectPage so hints match what the week tab shows.
  const siblingWeeksEst = campaignPeriod
    ? periodList.filter(p => p.parent_id === campaignPeriod.id)
    : [];
  const avgDaysEst = siblingWeeksEst.length > 0
    ? siblingWeeksEst.reduce((sum, w) =>
        sum + Math.ceil((new Date(String(w.end_date).slice(0, 10)) - new Date(String(w.start_date).slice(0, 10))) / 86400000) + 1,
      0) / siblingWeeksEst.length
    : 7;
  const campDaysEst = campaignPeriod
    ? Math.ceil((new Date(String(campaignPeriod.end_date).slice(0, 10)) - new Date(String(campaignPeriod.start_date).slice(0, 10))) / 86400000) + 1
    : 0;
  const estimatedWeeks = campDaysEst > 0
    ? Math.max(siblingWeeksEst.length, Math.round(campDaysEst / avgDaysEst))
    : (siblingWeeksEst.length || 1);

  // Load metrics + targets whenever project or period changes
  useEffect(() => {
    if (!selectedProject || !selectedPeriodId) return;

    // Determine the parent campaign id (if the selected period is a week)
    const selPeriod   = periodList.find(p => p.id === selectedPeriodId);
    const parentId    = selPeriod?.parent_id || null;

    const fetches = [
      api.getMetrics(selectedProject),
      api.getTargets({ project_id: selectedProject, period_id: selectedPeriodId }),
      // Also fetch campaign-period targets so we can fall back for campaign-type metrics
      parentId
        ? api.getTargets({ project_id: selectedProject, period_id: parentId })
        : Promise.resolve([]),
    ];

    Promise.all(fetches).then(([m, t, campaignT]) => {
      setMetrics(m);
      const tMap = {};
      const typeMap = {};
      const cTotals = {};

      // Lookup for campaign-period targets
      const campaignTMap = {};
      campaignT.forEach(ct => { campaignTMap[ct.metric_id] = ct.weekly_target; });

      // Estimate total sub-periods for proportional hints (mirrors ProjectPage logic)
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
      const numEstWeeks = cDays > 0 ? Math.max(sibWks.length, Math.round(cDays / avgWk)) : (sibWks.length || 1);

      m.forEach(metric => {
        typeMap[metric.id] = metric.type;
        if (metric.type === 'campaign') {
          const campaignTotal = campaignTMap[metric.id] ?? 0;
          cTotals[metric.id] = campaignTotal;
          if (parentId) {
            // Week selected: show week override if set, else computed proportional share
            const weekOverride = t.find(x => x.metric_id === metric.id)?.weekly_target;
            tMap[metric.id] = weekOverride != null
              ? weekOverride
              : (campaignTotal > 0 ? Math.ceil(campaignTotal / numEstWeeks) : '');
          } else {
            // Campaign selected: show campaign total for direct editing
            tMap[metric.id] = campaignTotal;
          }
        }
      });
      // Non-campaign metrics: use period-level target
      t.forEach(target => {
        if (typeMap[target.metric_id] !== 'campaign') {
          tMap[target.metric_id] = target.weekly_target;
        }
      });
      setTargets(tMap);
      setTypes(typeMap);
      setCampaignTotals(cTotals);
    }).catch(e => setError(e.message));
  }, [selectedProject, selectedPeriodId, periodList]);

  const handleTargetChange = (metricId, val) => setTargets(t => ({ ...t, [metricId]: val }));

  const handleTypeChange = async (metricId, type) => {
    setTypes(t => ({ ...t, [metricId]: type }));
    await api.updateMetric(metricId, { type }).catch(e => setError(e.message));
  };

  const handleSave = async () => {
    setSaving(true); setError(null); setSaveOk(false);
    try {
      await Promise.all(
        metrics.map(m => {
          // Always save to selectedPeriodId:
          //   • Campaign period selected → saves campaign total to campaign
          //   • Week period selected → saves week-level override to week
          // usePace already handles the override-vs-proportional logic.
          return api.upsertTarget({
            metric_id: m.id,
            period_id: selectedPeriodId,
            weekly_target: Number(targets[m.id] || 0),
          });
        })
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
        id, project_id: selectedProject, name: newMetric.name,
        type: newMetric.type, sort_order: metrics.length + 1,
      });
      if (newMetric.target) {
        await api.upsertTarget({
          metric_id: id, period_id: selectedPeriodId,
          weekly_target: Number(newMetric.target),
        });
      }
      setMetrics(m => [...m, created]);
      setTargets(t => ({ ...t, [id]: newMetric.target }));
      setTypes(t => ({ ...t, [id]: newMetric.type }));
      setNewMetric({ name: '', target: '', type: 'daily' });
      setAddingMetric(false);
    } catch (e) { setError(e.message); }
  };

  // ── Build grouped period options ─────────────────────────────────────────
  // campaigns = periods without parent_id
  // weeks     = periods with parent_id
  // standalone = periods without parent_id AND no children (old-style flat periods)
  const campaigns  = periodList.filter(p => !p.parent_id);
  const weeks      = periodList.filter(p =>  p.parent_id);
  const campaignHasWeeks = (cId) => weeks.some(w => w.parent_id === cId);

  // Periods that act as selectable targets for target-setting:
  //   • weeks (child periods) — primary
  //   • standalone campaigns that have NO weeks (old-style flat)
  const selectablePeriods = periodList.filter(p =>
    p.parent_id || !campaignHasWeeks(p.id)
  );

  const noPeriods = periodList.length === 0;
  const noSelectable = selectablePeriods.length === 0;

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
        ) : noSelectable ? (
          <span className="text-sm text-stone-400 italic">
            Add weeks inside your campaign in the <strong>Periods</strong> tab.
          </span>
        ) : (
          <select
            value={selectedPeriodId}
            onChange={e => setSelectedPeriodId(e.target.value)}
            className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-stone-300"
          >
            {/* Campaigns that have weeks → campaign selectable + weeks grouped */}
            {campaigns.filter(c => campaignHasWeeks(c.id)).map(campaign => (
              <optgroup key={campaign.id} label={`📅 ${campaign.name}`}>
                <option value={campaign.id}>
                  {campaign.name} – campaign total ({String(campaign.start_date).slice(0, 10)} – {String(campaign.end_date).slice(0, 10)})
                </option>
                {weeks
                  .filter(w => w.parent_id === campaign.id)
                  .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
                  .map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({String(w.start_date).slice(0, 10)} – {String(w.end_date).slice(0, 10)})
                    </option>
                  ))
                }
              </optgroup>
            ))}

            {/* Standalone periods (no parent, no children) */}
            {campaigns.filter(c => !campaignHasWeeks(c.id)).length > 0 && (
              <optgroup label="Standalone periods">
                {campaigns
                  .filter(c => !campaignHasWeeks(c.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({String(p.start_date).slice(0, 10)} – {String(p.end_date).slice(0, 10)})
                    </option>
                  ))
                }
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

      {/* Metrics table */}
      {selectedPeriodId && !noSelectable && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="text-left px-4 py-2.5 text-stone-500 font-medium">Metric</th>
                <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Daily equiv</th>
                <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Weekly target</th>
                <th className="text-right px-4 py-2.5 text-stone-500 font-medium">Type</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => {
                const wt = Number(targets[m.id] || 0);
                const metricType = types[m.id] || m.type;
                // Campaign metrics: daily equiv uses parent campaign's full duration
                const dtPeriod = metricType === 'campaign' && campaignPeriod
                  ? campaignPeriod
                  : period;
                const dt = dtPeriod ? dailyTarget(wt, dtPeriod) : 0;
                return (
                  <tr key={m.id} className="border-b border-stone-100">
                    <td className="px-4 py-2.5 text-stone-700">{m.name}</td>
                    <td className="px-4 py-2.5 text-right text-stone-400 text-xs">{formatNum(dt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <input
                          type="number"
                          min="0"
                          value={targets[m.id] ?? ''}
                          onChange={e => handleTargetChange(m.id, e.target.value)}
                          className="w-28 text-right border border-stone-200 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-stone-300"
                        />
                        {metricType === 'campaign' && !campaignPeriod && (
                          <span className="text-[10px] text-stone-400 italic">campaign total</span>
                        )}
                        {metricType === 'campaign' && campaignPeriod && (
                          <span className="text-[10px] text-stone-400 italic leading-tight text-right">
                            week override · total: {formatNum(campaignTotals[m.id] || 0)} / {estimatedWeeks}wks
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <select
                        value={types[m.id] || m.type}
                        onChange={e => handleTypeChange(m.id, e.target.value)}
                        className="text-xs border border-stone-200 rounded-md px-2 py-1 outline-none"
                      >
                        {TYPE_OPTIONS.map(t => (
                          <option key={t} value={t}>{t}</option>
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
                          title="Delete metric"
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
                      type="text"
                      placeholder="Metric name"
                      value={newMetric.name}
                      onChange={e => setNewMetric(n => ({ ...n, name: e.target.value }))}
                      className="w-full border border-stone-200 rounded px-2 py-1 text-sm outline-none"
                      autoFocus
                    />
                  </td>
                  <td className="px-4 py-2 text-right text-stone-300 text-xs">—</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      placeholder="Target"
                      value={newMetric.target}
                      onChange={e => setNewMetric(n => ({ ...n, target: e.target.value }))}
                      className="w-28 text-right border border-stone-200 rounded px-2 py-1 text-sm outline-none"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <select
                      value={newMetric.type}
                      onChange={e => setNewMetric(n => ({ ...n, type: e.target.value }))}
                      className="text-xs border border-stone-200 rounded px-2 py-1 outline-none"
                    >
                      {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={handleAddMetric} className="text-xs px-2 py-1 bg-stone-800 text-white rounded">Add</button>
                      <button onClick={() => setAddingMetric(false)} className="text-xs px-2 py-1 border border-stone-200 rounded text-stone-500">Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-2">
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
          <p className="text-xs text-stone-400 italic">
            Target changes take effect from next entry. Historical data is always kept.
            {' '}Manage periods in the <strong>Periods</strong> tab.
          </p>
        </>
      )}
    </div>
  );
}
