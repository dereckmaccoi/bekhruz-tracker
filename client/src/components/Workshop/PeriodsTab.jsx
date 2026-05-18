import { useState, useEffect } from 'react';
import { api } from '../../hooks/useApi.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  return `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

function daysBetween(start, end) {
  return Math.max(0, Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1);
}

function genId(base) {
  return `${base.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
}

// Add N days to a YYYY-MM-DD string
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Auto-generate weekly periods within a campaign ────────────────────────────
function generateWeeks(campaign) {
  const weeks = [];
  let cur = String(campaign.start_date).slice(0, 10);
  const end = String(campaign.end_date).slice(0, 10);
  let i = 1;
  while (cur <= end) {
    const weekEnd = addDays(cur, 6);
    const actualEnd = weekEnd > end ? end : weekEnd;
    weeks.push({
      id: genId(`${campaign.id}_w${i}`),
      name: `Phase ${i}`,
      start_date: cur,
      end_date: actualEnd,
      project_id: campaign.project_id,
      parent_id: campaign.id,
    });
    cur = addDays(actualEnd, 1);
    i++;
  }
  return weeks;
}

// ── Inline edit row ───────────────────────────────────────────────────────────
function EditRow({ initial, onSave, onCancel, indent = false }) {
  const [form, setForm] = useState(initial);
  return (
    <div className={`flex flex-wrap gap-2 items-center ${indent ? 'pl-8' : ''} py-2`}>
      <input
        className="border border-stone-200 rounded px-2 py-1 text-sm flex-1 min-w-[120px] outline-none focus:ring-2 focus:ring-stone-300"
        placeholder="Name"
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        autoFocus
      />
      <input
        type="date"
        className="border border-stone-200 rounded px-2 py-1 text-sm outline-none"
        value={form.start_date}
        onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
      />
      <span className="text-stone-400 text-xs">–</span>
      <input
        type="date"
        className="border border-stone-200 rounded px-2 py-1 text-sm outline-none"
        value={form.end_date}
        onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
      />
      {form.start_date && form.end_date && (
        <span className="text-xs text-stone-400">{daysBetween(form.start_date, form.end_date)} days</span>
      )}
      <button
        onClick={() => onSave(form)}
        disabled={!form.name || !form.start_date || !form.end_date}
        className="px-3 py-1 bg-stone-800 text-white rounded text-xs font-medium disabled:opacity-40"
      >Save</button>
      <button onClick={onCancel} className="text-xs text-stone-400 hover:text-stone-600 underline">Cancel</button>
    </div>
  );
}

// ── Week row ──────────────────────────────────────────────────────────────────
function WeekRow({ week, onEdit, onDelete, today }) {
  const [confirm, setConfirm] = useState(false);
  const isCompleted = String(week.end_date).slice(0, 10) < today;
  const isActive    = String(week.start_date).slice(0, 10) <= today && String(week.end_date).slice(0, 10) >= today;

  return (
    <div className="flex items-center gap-3 pl-8 py-2 border-t border-stone-50 group">
      {/* indent line */}
      <div className="w-px h-5 bg-stone-200 -ml-5 mr-1 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-700 font-medium truncate">{week.name}</span>
          {isActive && (
            <span className="text-[10px] bg-[#1D9E75] text-white rounded-full px-1.5 py-0.5 font-medium">Active</span>
          )}
          {isCompleted && (
            <span className="text-[10px] bg-stone-100 text-stone-400 rounded-full px-1.5 py-0.5">Done</span>
          )}
        </div>
        <div className="text-xs text-stone-400 mt-0.5">
          {fmtDate(week.start_date)} – {fmtDate(week.end_date)} · {week.days ?? daysBetween(week.start_date, week.end_date)} days
        </div>
      </div>

      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(week)} className="text-xs text-stone-400 hover:text-stone-600 underline">Edit</button>
        {confirm ? (
          <span className="text-xs flex gap-1">
            <button onClick={() => onDelete(week.id)} className="text-[#E24B4A] underline">Delete</button>
            <button onClick={() => setConfirm(false)} className="text-stone-400 underline">Cancel</button>
          </span>
        ) : (
          <button onClick={() => setConfirm(true)} className="text-xs text-stone-300 hover:text-[#E24B4A] underline">Delete</button>
        )}
      </div>
    </div>
  );
}

// ── Campaign card ─────────────────────────────────────────────────────────────
function CampaignCard({ campaign, weeks, today, onAddWeek, onEditCampaign, onDeleteCampaign, onEditWeek, onDeleteWeek }) {
  const [open, setOpen]         = useState(true);
  const [addingWeek, setAddingWeek] = useState(false);
  const [confirm, setConfirm]   = useState(false);
  const [generating, setGenerating] = useState(false);

  const isCompleted = String(campaign.end_date).slice(0, 10) < today;

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Campaign header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors select-none"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-stone-400 text-sm">{open ? '▾' : '▸'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-stone-800">{campaign.name}</span>
            {isCompleted && (
              <span className="text-[10px] bg-stone-100 text-stone-400 rounded-full px-1.5 py-0.5">Completed</span>
            )}
            <span className="text-xs text-stone-400">
              {fmtDate(campaign.start_date)} – {fmtDate(campaign.end_date)}
              {' '}· {campaign.days ?? daysBetween(campaign.start_date, campaign.end_date)} days
              {weeks.length > 0 && ` · ${weeks.length} week${weeks.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>
        <div className="flex gap-2 ml-2" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onEditCampaign(campaign)}
            className="text-xs text-stone-400 hover:text-stone-600 underline"
          >Edit</button>
          {confirm ? (
            <span className="text-xs flex gap-1">
              <button onClick={() => onDeleteCampaign(campaign.id)} className="text-[#E24B4A] underline">Delete all</button>
              <button onClick={() => setConfirm(false)} className="text-stone-400 underline">No</button>
            </span>
          ) : (
            <button onClick={() => setConfirm(true)} className="text-xs text-stone-300 hover:text-[#E24B4A] underline">Delete</button>
          )}
        </div>
      </div>

      {/* Weeks */}
      {open && (
        <div className="border-t border-stone-100">
          {weeks.length === 0 && !addingWeek && (
            <div className="pl-8 py-3 text-xs text-stone-400 italic">No weeks yet — add one below.</div>
          )}

          {weeks.map(w => (
            <WeekRow
              key={w.id}
              week={w}
              today={today}
              onEdit={onEditWeek}
              onDelete={onDeleteWeek}
            />
          ))}

          {/* Add week row */}
          {addingWeek ? (
            <div className="border-t border-stone-100">
              <EditRow
                initial={{
                  name: `Phase ${weeks.length + 1}`,
                  start_date: weeks.length > 0
                    ? addDays(String(weeks[weeks.length - 1].end_date).slice(0, 10), 1)
                    : String(campaign.start_date).slice(0, 10),
                  end_date: '',
                }}
                indent
                onSave={form => { onAddWeek(campaign, form); setAddingWeek(false); }}
                onCancel={() => setAddingWeek(false)}
              />
            </div>
          ) : (
            <div className="border-t border-stone-50 px-4 py-2 flex items-center gap-3">
              <button
                onClick={() => setAddingWeek(true)}
                className="text-sm text-stone-400 hover:text-stone-600 flex items-center gap-1"
              >
                <span className="text-lg leading-none">+</span> Add sub-period
              </button>
              {weeks.length === 0 && (
                <button
                  disabled={generating}
                  onClick={async () => {
                    setGenerating(true);
                    await onAddWeek(campaign, null, true); // true = auto-generate
                    setGenerating(false);
                  }}
                  className="text-sm text-stone-400 hover:text-stone-700 flex items-center gap-1 ml-2 border border-stone-200 rounded-lg px-3 py-1 hover:border-stone-400 transition-colors disabled:opacity-50"
                >
                  ⚡ Auto-generate (7-day phases)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main PeriodsTab ───────────────────────────────────────────────────────────
export default function PeriodsTab({ selectedProject, projects, onProjectChange, onPeriodsChange }) {
  const projectList = projects || [];

  const [allPeriods, setAllPeriods] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [addingCampaign, setAddingCampaign] = useState(false);
  const [editingPeriod, setEditingPeriod]   = useState(null); // {period, isCampaign}

  const today = new Date().toISOString().slice(0, 10);

  const load = () => {
    if (!selectedProject) return;
    setLoading(true);
    api.getPeriods({ project_id: selectedProject })
      .then(ps => setAllPeriods(ps))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [selectedProject]);

  // Split into campaigns (no parent) and weeks (have parent)
  const campaigns = allPeriods
    .filter(p => !p.parent_id)
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));

  const weeksFor = (campaignId) =>
    allPeriods
      .filter(p => p.parent_id === campaignId)
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAddCampaign = async (form) => {
    const id = genId(form.name);
    try {
      const created = await api.createPeriod({ ...form, id, project_id: selectedProject, parent_id: null });
      setAllPeriods(ps => [...ps, created]);
      setAddingCampaign(false);
      onPeriodsChange?.();
    } catch (e) { setError(e.message); }
  };

  const handleAddWeek = async (campaign, form, autoGenerate = false) => {
    try {
      if (autoGenerate) {
        const newWeeks = generateWeeks(campaign);
        const created = await Promise.all(newWeeks.map(w => api.createPeriod(w)));
        setAllPeriods(ps => [...ps, ...created]);
      } else {
        const id = genId(form.name);
        const created = await api.createPeriod({
          ...form, id,
          project_id: selectedProject,
          parent_id: campaign.id,
        });
        setAllPeriods(ps => [...ps, created]);
      }
      onPeriodsChange?.();
    } catch (e) { setError(e.message); }
  };

  const handleEditSave = async (form) => {
    try {
      const updated = await api.updatePeriod(form.id, {
        name: form.name,
        start_date: form.start_date,
        end_date: form.end_date,
        parent_id: form.parent_id ?? null,
      });
      setAllPeriods(ps => ps.map(p => p.id === updated.id ? updated : p));
      setEditingPeriod(null);
      onPeriodsChange?.();
    } catch (e) { setError(e.message); }
  };

  const handleDeletePeriod = async (id) => {
    try {
      await api.deletePeriod(id);
      // Remove deleted period AND any children (cascade is on server, but remove locally too)
      setAllPeriods(ps => ps.filter(p => p.id !== id && p.parent_id !== id));
      onPeriodsChange?.();
    } catch (e) { setError(e.message); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
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

      {error && (
        <div className="bg-[#FCEBEB] border border-[#E24B4A] rounded-lg px-4 py-3 text-sm text-[#791F1F]">
          {error}
          <button className="ml-3 underline text-xs" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Campaign list */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-14 bg-stone-100 rounded-xl" />
          <div className="h-14 bg-stone-100 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.length === 0 && !addingCampaign && (
            <div className="text-sm text-stone-400 bg-stone-50 rounded-xl px-4 py-8 text-center">
              No campaigns yet. Add your first campaign below.
            </div>
          )}

          {campaigns.map(campaign => {
            // If we're editing THIS period, show inline editor instead
            if (editingPeriod?.id === campaign.id) {
              return (
                <div key={campaign.id} className="bg-white border border-stone-300 rounded-xl p-3">
                  <p className="text-xs text-stone-400 mb-2 font-medium uppercase tracking-wide">Editing campaign</p>
                  <EditRow
                    initial={editingPeriod}
                    onSave={handleEditSave}
                    onCancel={() => setEditingPeriod(null)}
                  />
                </div>
              );
            }

            const weeks = weeksFor(campaign.id);
            // Check if any week is being edited
            const editingWeekInThisCampaign = weeks.find(w => editingPeriod?.id === w.id);

            return (
              <div key={campaign.id}>
                <CampaignCard
                  campaign={campaign}
                  weeks={editingWeekInThisCampaign
                    ? weeks.map(w => w.id === editingPeriod?.id ? { ...w, _editing: true } : w)
                    : weeks}
                  today={today}
                  onAddWeek={handleAddWeek}
                  onEditCampaign={c => setEditingPeriod({ ...c })}
                  onDeleteCampaign={handleDeletePeriod}
                  onEditWeek={w => setEditingPeriod({ ...w })}
                  onDeleteWeek={handleDeletePeriod}
                />
                {/* Inline week editor below campaign card */}
                {editingWeekInThisCampaign && (
                  <div className="bg-white border border-stone-300 rounded-xl p-3 mt-1">
                    <p className="text-xs text-stone-400 mb-2 font-medium uppercase tracking-wide">Editing week</p>
                    <EditRow
                      initial={editingPeriod}
                      onSave={handleEditSave}
                      onCancel={() => setEditingPeriod(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Add campaign */}
          {addingCampaign ? (
            <div className="bg-white border border-stone-300 rounded-xl p-4">
              <p className="text-xs text-stone-500 font-semibold uppercase tracking-wide mb-3">New campaign</p>
              <EditRow
                initial={{ name: '', start_date: '', end_date: '' }}
                onSave={handleAddCampaign}
                onCancel={() => setAddingCampaign(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingCampaign(true)}
              className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 border border-dashed border-stone-300 hover:border-stone-500 rounded-xl px-4 py-3 w-full transition-colors"
            >
              <span className="text-xl leading-none">+</span>
              Add campaign
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-stone-400 italic">
        Campaigns are the big periods (months/quarters). Sub-periods live inside them — name them anything (Sprint 1, Phase 1, Week 1) and make them any length. Set targets per sub-period in the Targets tab.
      </p>
    </div>
  );
}
