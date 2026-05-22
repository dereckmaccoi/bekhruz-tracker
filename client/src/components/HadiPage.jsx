import { useState, useEffect, useMemo } from 'react';
import { api } from '../hooks/useApi.js';
import HadiPanel from './HadiPanel.jsx';

const PROJECT_NAMES = {
  tsb: 'TSB', fc: 'Full Contact', mc: 'Milliard Club', sd: 'Sales Doctor',
};
const PROJECT_COLORS = {
  tsb: '#E24B4A', fc: '#1D9E75', mc: '#7F77DD', sd: '#BA7517',
};

const STATUS_META = {
  not_started: { label: 'Not started', bg: 'bg-stone-100', text: 'text-stone-500' },
  in_progress:  { label: 'In progress', bg: 'bg-amber-100', text: 'text-amber-700' },
  done:         { label: 'Done',        bg: 'bg-green-100', text: 'text-green-700' },
};

function DonutChart({ success, failed, running, total }) {
  // circumference ≈ 100 when r = 15.9155
  const r = 15.9155;
  const circ = 2 * Math.PI * r;
  const successPct = total ? (success / total) * circ : 0;
  const failedPct  = total ? (failed  / total) * circ : 0;
  const runningPct = total ? (running / total) * circ : 0;

  return (
    <svg viewBox="0 0 40 40" className="w-16 h-16 -rotate-90">
      {/* track */}
      <circle cx="20" cy="20" r={r} fill="none" stroke="#e7e5e4" strokeWidth="5" />
      {/* success (green) */}
      <circle cx="20" cy="20" r={r} fill="none" stroke="#1D9E75" strokeWidth="5"
        strokeDasharray={`${successPct} ${circ - successPct}`}
        strokeDashoffset="0" />
      {/* running (amber) */}
      <circle cx="20" cy="20" r={r} fill="none" stroke="#EF9F27" strokeWidth="5"
        strokeDasharray={`${runningPct} ${circ - runningPct}`}
        strokeDashoffset={`${-successPct}`} />
      {/* failed (red) */}
      <circle cx="20" cy="20" r={r} fill="none" stroke="#E24B4A" strokeWidth="5"
        strokeDasharray={`${failedPct} ${circ - failedPct}`}
        strokeDashoffset={`${-(successPct + runningPct)}`} />
    </svg>
  );
}

function StatusDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[value] || STATUS_META.not_started;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.text} whitespace-nowrap`}
      >
        {meta.label} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden min-w-[130px]">
          {Object.entries(STATUS_META).map(([val, m]) => (
            <button
              type="button"
              key={val}
              onClick={() => { onChange(val); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-stone-50 ${val === value ? 'font-semibold' : ''}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HadiCard({ row, onEdit, onStatusChange }) {
  return (
    <div className="px-4 py-3.5 border-b border-stone-50 last:border-0">
      {/* Top row: project · status badge · deadline */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {row.project_id && (
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: PROJECT_COLORS[row.project_id] || '#999' }}
            />
            {PROJECT_NAMES[row.project_id] || row.project_id}
          </span>
        )}
        <StatusDropdown
          value={row.status}
          onChange={val => onStatusChange(row.id, val)}
        />
        {row.insight_deadline && (
          <span className="text-xs text-stone-400 ml-auto">
            {new Date(row.insight_deadline).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
            })}
          </span>
        )}
      </div>

      {/* Hypothesis text */}
      <div className="font-medium text-stone-900 text-sm leading-snug line-clamp-3">
        {row.hypothesis}
      </div>

      {/* Insight snippet */}
      {row.insight && (
        <p className="text-xs text-stone-400 mt-1 line-clamp-2">{row.insight}</p>
      )}

      {/* Responsible + edit button */}
      <div className="flex items-center justify-between gap-2 mt-2">
        {row.responsible ? (
          <span className="text-xs text-stone-400">👤 {row.responsible}</span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => onEdit(row)}
          className="text-stone-400 hover:text-stone-700 p-1 rounded transition-colors"
          title="Edit"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function HadiPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.getHypotheses()
      .then(setRows)
      .catch(() => setError('Failed to load hypotheses. Please try again.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Stats
  const stats = useMemo(() => {
    const done    = rows.filter(r => r.status === 'done');
    const success = done.filter(r => r.success === true).length;
    const failed  = done.filter(r => r.success === false).length;
    const running = rows.filter(r => r.status === 'in_progress').length;
    return { total: rows.length, success, failed, running, doneCount: done.length };
  }, [rows]);

  // Filtered rows
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterStatus  && r.status     !== filterStatus)  return false;
      if (filterProject && r.project_id !== filterProject) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.hypothesis?.toLowerCase().includes(q) ||
          r.campaign_context?.toLowerCase().includes(q) ||
          r.responsible?.toLowerCase().includes(q) ||
          r.insight?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, search, filterStatus, filterProject]);

  // Group by campaign_context
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach(r => {
      const key = r.campaign_context || '— No campaign —';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const handleSave = async (payload) => {
    try {
      if (editing?.id) {
        await api.updateHypothesis(editing.id, payload);
      } else {
        await api.createHypothesis(payload);
      }
      load();
    } catch {
      setError('Failed to save. Please try again.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteHypothesis(id);
      load();
    } catch {
      setError('Failed to delete. Please try again.');
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.updateHypothesis(id, { status });
      load();
    } catch {
      setError('Failed to update status. Please try again.');
    }
  };

  const openCreate = () => { setEditing(null); setPanelOpen(true); };
  const openEdit   = (row) => { setEditing(row); setPanelOpen(true); };

  const successRate = stats.doneCount > 0
    ? Math.round((stats.success / stats.doneCount) * 100)
    : null;

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900">🚀 HADI Board</h1>
          <p className="text-sm text-stone-400 mt-0.5">Hypothesis → Action → Data → Insight</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-stone-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-stone-800 transition-all shadow-sm"
        >
          <span className="text-base leading-none">+</span>
          New hypothesis
        </button>
      </div>

      {/* Stats bar */}
      <div className="bg-white border border-stone-100 rounded-2xl p-5 mb-5 flex items-center gap-8">
        <DonutChart
          success={stats.success}
          failed={stats.failed}
          running={stats.running}
          total={stats.total}
        />
        <div className="flex gap-8 flex-wrap">
          <div>
            <div className="text-2xl font-bold text-stone-900">{stats.total}</div>
            <div className="text-xs text-stone-400">Total</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-600">{stats.running}</div>
            <div className="text-xs text-stone-400">In progress</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{stats.success}</div>
            <div className="text-xs text-stone-400">Succeeded</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
            <div className="text-xs text-stone-400">Failed</div>
          </div>
          {successRate !== null && (
            <div>
              <div className="text-2xl font-bold text-stone-900">{successRate}%</div>
              <div className="text-xs text-stone-400">Success rate</div>
            </div>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900 bg-white"
            placeholder="Search hypotheses…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
        <select
          className="text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none"
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
        >
          <option value="">All projects</option>
          {Object.entries(PROJECT_NAMES).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-[#FCEBEB] text-[#791F1F] text-sm rounded-lg border border-[#E24B4A]">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-sm text-stone-400 py-8 text-center">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="text-sm text-stone-400 py-12 text-center">
          No hypotheses yet.{' '}
          <button onClick={openCreate} className="underline text-stone-600 hover:text-stone-900">
            Add the first one
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([campaign, items]) => (
            <div key={campaign} className="bg-white border border-stone-100 rounded-2xl overflow-hidden">
              {/* campaign header */}
              <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-2">
                <span className="text-sm font-semibold text-stone-700">{campaign}</span>
                <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">{items.length}</span>
              </div>

              {/* Mobile cards */}
              <div>
                {items.map(row => (
                  <HadiCard
                    key={row.id}
                    row={row}
                    onEdit={openEdit}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slide-out panel */}
      {panelOpen && (
        <HadiPanel
          initial={editing}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
