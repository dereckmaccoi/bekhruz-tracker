import { useState, useEffect } from 'react';
import { api } from '../hooks/useApi.js';
import { formatNum, detectActivePeriod } from '../utils/calculations.js';
import { useProjects } from '../context/ProjectsContext.jsx';

const today = () => new Date().toISOString().slice(0, 10);

// State machine steps: idle → project → metric → value → saving → done
export default function QuickEntry() {
  const { projects: PROJECTS } = useProjects();
  const [open, setOpen]         = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [step, setStep]         = useState('project');  // project | metric | value
  const [project, setProject]   = useState(null);
  const [period, setPeriod]     = useState(null);
  const [metrics, setMetrics]   = useState([]);
  const [targets, setTargets]   = useState([]);
  const [metric, setMetric]     = useState(null);
  const [value, setValue]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Red dot badge: show after noon if no entry logged today this session
  useEffect(() => {
    const isPastNoon = new Date().getHours() >= 12;
    if (!isPastNoon) { setShowBadge(false); return; }
    const lastEntry = sessionStorage.getItem('lastEntryDate');
    setShowBadge(lastEntry !== today());
  }, []);

  // Reset when closed
  const close = () => {
    setOpen(false);
    setTimeout(() => {
      setStep('project'); setProject(null); setPeriod(null);
      setMetrics([]); setTargets([]); setMetric(null);
      setValue(''); setSaved(false);
    }, 300);
  };

  // Load metrics+period when project selected
  useEffect(() => {
    if (!project) return;
    setLoadingMetrics(true);
    api.getPeriods({ project_id: project.id }).then(async (periods) => {
      const activePeriod = detectActivePeriod(periods);
      setPeriod(activePeriod);
      if (activePeriod) {
        const data = await api.getProject(project.id, activePeriod.id).catch(() => null);
        if (data) { setMetrics(data.metrics || []); setTargets(data.targets || []); }
      }
    }).finally(() => setLoadingMetrics(false));
  }, [project]);

  const selectProject = (p) => { setProject(p); setStep('metric'); };
  const selectMetric  = (m) => { setMetric(m);  setStep('value'); };

  const handleSave = async () => {
    if (!value || !metric || !period) return;
    setSaving(true);
    try {
      await api.upsertEntry({
        metric_id: metric.id,
        period_id: period.id,
        date: today(),
        value: Number(value),
      });
      setSaved(true);
      sessionStorage.setItem('lastEntryDate', today());
      setShowBadge(false);
      setTimeout(close, 1200);
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (step === 'metric') { setStep('project'); setProject(null); setMetrics([]); }
    if (step === 'value')  { setStep('metric');  setMetric(null); setValue(''); }
  };

  const targetMap = {};
  targets.forEach(t => { targetMap[t.metric_id] = t; });

  return (
    <>
      {/* Floating "+" button with optional red dot badge */}
      <div className="fixed bottom-24 left-4 z-50">
        <button
          onClick={() => setOpen(true)}
          className="relative w-12 h-12 rounded-full bg-stone-800 text-white shadow-lg flex items-center justify-center text-2xl hover:bg-stone-700 active:scale-95 transition-all select-none"
          title="Quick entry"
        >
          +
          {showBadge && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#E24B4A] border-2 border-white" />
          )}
        </button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={close}
        />
      )}

      {/* Slide-up drawer */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '85vh', overflowY: 'auto' }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stone-200" />
        </div>

        <div className="px-5 pb-8 pt-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              {step !== 'project' && (
                <button onClick={back} className="text-stone-400 hover:text-stone-700 mr-1 text-lg leading-none">←</button>
              )}
              <h2 className="text-base font-semibold text-stone-900">
                {saved          ? '✓ Saved!'
                 : step === 'project' ? 'Quick Entry'
                 : step === 'metric'  ? project.name
                 : `${metric.name}`}
              </h2>
              {project && step !== 'project' && (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: project.color }} />
              )}
            </div>
            <button onClick={close} className="text-stone-400 hover:text-stone-600 text-xl leading-none">×</button>
          </div>

          {/* ── Step: Project ── */}
          {step === 'project' && (
            <div className="grid grid-cols-2 gap-3">
              {PROJECTS.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectProject(p)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-stone-100 bg-stone-50 hover:bg-stone-100 active:scale-95 transition-all text-left"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="font-medium text-stone-800 text-sm">{p.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Step: Metric ── */}
          {step === 'metric' && (
            <div className="space-y-2">
              {loadingMetrics ? (
                <div className="text-sm text-stone-400 text-center py-8">Loading…</div>
              ) : metrics.length === 0 ? (
                <div className="text-sm text-stone-400 text-center py-8">No metrics set up for this project.</div>
              ) : (
                metrics.map(m => {
                  const tgt = targetMap[m.id];
                  return (
                    <button
                      key={m.id}
                      onClick={() => selectMetric(m)}
                      className="w-full flex items-center justify-between p-4 rounded-xl border border-stone-100 bg-stone-50 hover:bg-stone-100 active:scale-95 transition-all text-left"
                    >
                      <span className="font-medium text-stone-800 text-sm">{m.name}</span>
                      {tgt && (
                        <span className="text-xs text-stone-400">target {formatNum(tgt.weekly_target)}/wk</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* ── Step: Value ── */}
          {step === 'value' && (
            <div>
              <p className="text-sm text-stone-500 mb-1">
                {today()} · {project?.name}
                {targetMap[metric?.id] && (
                  <span className="text-stone-400"> · daily target ~{formatNum(Math.round(targetMap[metric.id].weekly_target / (period?.days || 7)))}</span>
                )}
              </p>

              <input
                type="number"
                inputMode="numeric"
                placeholder="Enter value…"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                autoFocus
                className="w-full text-3xl font-bold text-stone-900 bg-stone-50 border border-stone-200 rounded-xl px-4 py-4 mt-3 mb-5 outline-none focus:border-stone-400 transition-colors"
              />

              {saved ? (
                <div className="w-full py-4 rounded-xl bg-[#E1F5EE] text-[#085041] font-semibold text-center text-base">
                  ✓ Saved!
                </div>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={!value || saving}
                  className="w-full py-4 rounded-xl bg-stone-800 text-white font-semibold text-base hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
                >
                  {saving ? 'Saving…' : `Save ${metric?.name}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
