# HADI Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a HADI (Hypothesis → Action → Data → Insight) experiment-tracking page to the existing performance tracker app.

**Architecture:** New top-level route `/hadi` backed by a `hypotheses` Postgres table. The page shows a stats bar, search/filter row, rows grouped by campaign context, and a slide-out create/edit panel. CRUD lives in a new Express router that follows the existing `routes/*.js` pattern; API methods are appended to `useApi.js`.

**Tech Stack:** React 18 + Vite, Tailwind CSS, React Router v6, Express.js, PostgreSQL (via existing `query` helper)

---

## File Map

| Action | Path |
|--------|------|
| Modify | `server/index.js` — add `hypotheses` table migration |
| Create | `server/routes/hypotheses.js` — CRUD router |
| Modify | `server/index.js` — import & mount hypotheses router |
| Modify | `client/src/hooks/useApi.js` — add 4 hypotheses methods |
| Create | `client/src/components/HadiPage.jsx` — page with stats, table, filters |
| Create | `client/src/components/HadiPanel.jsx` — slide-out create/edit form |
| Modify | `client/src/components/Sidebar.jsx` — add 🚀 HADI nav link |
| Modify | `client/src/App.jsx` — add `/hadi` route |

---

### Task 1: DB Migration — add `hypotheses` table

**Files:**
- Modify: `server/index.js` (inside `runMigrations()`)

- [ ] **Step 1: Add the CREATE TABLE migration**

In `server/index.js`, inside `runMigrations()`, after the `daily_entries` CREATE block (around line 77) and before the `ALTER TABLE` section (line 79), add:

```js
  await query(`
    CREATE TABLE IF NOT EXISTS hypotheses (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id       TEXT REFERENCES projects(id) ON DELETE SET NULL,
      hypothesis       TEXT NOT NULL,
      point_a          TEXT,
      point_b          TEXT,
      action_deadline  DATE,
      insight_deadline DATE,
      responsible      TEXT,
      result           TEXT,
      idea_score       INTEGER,
      success          BOOLEAN,
      status           TEXT NOT NULL DEFAULT 'not_started',
      insight          TEXT,
      campaign_context TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
```

- [ ] **Step 2: Add index for fast filtering by project and status**

In the same migration function, after the existing `CREATE INDEX` block (after line 105), add:

```js
  await query(`CREATE INDEX IF NOT EXISTS idx_hypotheses_project ON hypotheses(project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_hypotheses_status  ON hypotheses(status)`);
```

- [ ] **Step 3: Start the server and verify migration runs cleanly**

```bash
cd C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker
node server/index.js
```

Expected: server starts, logs show no migration errors. If running against the production Railway DB, the `IF NOT EXISTS` guard keeps it safe.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add hypotheses table migration"
```

---

### Task 2: Server route — `hypotheses` CRUD

**Files:**
- Create: `server/routes/hypotheses.js`

- [ ] **Step 1: Create the route file**

Create `server/routes/hypotheses.js` with the following content:

```js
import { Router } from 'express';
import { query } from '../lib/db.js';

const router = Router();

// GET /api/hypotheses — list all, optional ?project_id= and ?status=
router.get('/', async (req, res) => {
  const { project_id, status } = req.query;
  try {
    const conditions = [];
    const values = [];
    if (project_id) { conditions.push(`project_id = $${values.length + 1}`); values.push(project_id); }
    if (status)     { conditions.push(`status = $${values.length + 1}`);     values.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT * FROM hypotheses ${where} ORDER BY created_at DESC`,
      values
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/hypotheses — create
router.post('/', async (req, res) => {
  const {
    project_id, hypothesis, point_a, point_b,
    action_deadline, insight_deadline, responsible,
    result, idea_score, success, status, insight, campaign_context,
  } = req.body;
  if (!hypothesis) return res.status(400).json({ error: 'hypothesis is required' });
  try {
    const { rows } = await query(
      `INSERT INTO hypotheses
        (project_id, hypothesis, point_a, point_b, action_deadline, insight_deadline,
         responsible, result, idea_score, success, status, insight, campaign_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        project_id ?? null, hypothesis, point_a ?? null, point_b ?? null,
        action_deadline ?? null, insight_deadline ?? null, responsible ?? null,
        result ?? null, idea_score ?? null, success ?? null,
        status ?? 'not_started', insight ?? null, campaign_context ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/hypotheses/:id — update
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [
    'project_id','hypothesis','point_a','point_b',
    'action_deadline','insight_deadline','responsible',
    'result','idea_score','success','status','insight','campaign_context',
  ];
  const updates = [];
  const values = [];
  fields.forEach(f => {
    if (Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates.push(`${f} = $${values.length + 1}`);
      values.push(req.body[f]);
    }
  });
  if (!updates.length) return res.status(400).json({ error: 'no fields to update' });
  updates.push(`updated_at = NOW()`);
  values.push(id);
  try {
    const { rows } = await query(
      `UPDATE hypotheses SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/hypotheses/:id
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM hypotheses WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
```

- [ ] **Step 2: Mount the router in `server/index.js`**

At the top of `server/index.js`, add the import after the existing router imports (around line 12):

```js
import hypothesesRouter from './routes/hypotheses.js';
```

In the middleware section where other routers are mounted (`app.use('/api/...')`), add:

```js
app.use('/api/hypotheses', hypothesesRouter);
```

- [ ] **Step 3: Test the endpoints manually**

Start the server, then in a separate terminal:

```bash
# Create a test hypothesis
curl -s -X POST http://localhost:3001/api/hypotheses \
  -H "Content-Type: application/json" \
  -d '{"hypothesis":"Test H","status":"not_started"}' | jq .

# List
curl -s http://localhost:3001/api/hypotheses | jq .

# Update (use the id returned above)
curl -s -X PUT http://localhost:3001/api/hypotheses/<id> \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}' | jq .

# Delete
curl -s -X DELETE http://localhost:3001/api/hypotheses/<id>
```

Expected: create returns `201` with full row; list returns array; update returns updated row; delete returns `204`.

- [ ] **Step 4: Commit**

```bash
git add server/routes/hypotheses.js server/index.js
git commit -m "feat: add hypotheses CRUD API route"
```

---

### Task 3: Client API methods in `useApi.js`

**Files:**
- Modify: `client/src/hooks/useApi.js`

- [ ] **Step 1: Add four methods to the `api` export**

In `client/src/hooks/useApi.js`, inside the `export const api = { ... }` object, add after the last existing method (`getProject`):

```js
  // Hypotheses
  getHypotheses: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/hypotheses${q ? `?${q}` : ''}`);
  },
  createHypothesis: (body) => request('/hypotheses', { method: 'POST', body }),
  updateHypothesis: (id, body) => request(`/hypotheses/${id}`, { method: 'PUT', body }),
  deleteHypothesis: (id) => request(`/hypotheses/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 2: Verify no syntax errors**

```bash
cd C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker
npx --yes acorn --ecma2020 --module client/src/hooks/useApi.js > nul && echo OK
```

Expected: prints `OK` (or no error — acorn exits 0 if valid).

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useApi.js
git commit -m "feat: add hypotheses API methods to useApi"
```

---

### Task 4: `HadiPanel.jsx` — slide-out create/edit form

**Files:**
- Create: `client/src/components/HadiPanel.jsx`

`★ Insight ─────────────────────────────────────`
HadiPanel is a **controlled form component** — the parent (HadiPage) owns the data and passes `initial` values + callbacks. This makes the panel stateless enough to be cleanly mounted/unmounted as a slide-over without stale state.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Create `HadiPanel.jsx`**

```jsx
import { useState, useEffect } from 'react';

const PROJECTS = [
  { id: 'tsb',  name: 'TSB' },
  { id: 'fc',   name: 'Full Contact' },
  { id: 'mc',   name: 'Milliard Club' },
  { id: 'sd',   name: 'Sales Doctor' },
];

const STATUSES = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done',        label: 'Done' },
];

const EMPTY = {
  project_id: '', hypothesis: '', point_a: '', point_b: '',
  action_deadline: '', insight_deadline: '', responsible: '',
  result: '', idea_score: '', success: '', status: 'not_started',
  insight: '', campaign_context: '',
};

export default function HadiPanel({ initial, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
  }, [initial]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.hypothesis.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        project_id:       form.project_id       || null,
        action_deadline:  form.action_deadline   || null,
        insight_deadline: form.insight_deadline  || null,
        idea_score:       form.idea_score !== '' ? Number(form.idea_score) : null,
        success:          form.success === 'true' ? true : form.success === 'false' ? false : null,
      };
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 bg-white';
  const labelCls = 'block text-xs font-medium text-stone-500 mb-1';

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/20" />

      {/* panel */}
      <div
        className="relative z-10 w-[480px] max-w-full bg-white h-full shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-stone-900 text-base">
            {initial?.id ? 'Edit hypothesis' : 'New hypothesis'}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* form body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* H — Hypothesis */}
          <div>
            <label className={labelCls}>🧪 Hypothesis <span className="text-red-500">*</span></label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="If we do X, then Y will happen because Z"
              value={form.hypothesis}
              onChange={e => set('hypothesis', e.target.value)}
              required
            />
          </div>

          {/* A — Action */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>⚡ Point A (current state)</label>
              <input className={inputCls} value={form.point_a} onChange={e => set('point_a', e.target.value)} placeholder="e.g. 3% CTR" />
            </div>
            <div>
              <label className={labelCls}>🎯 Point B (target)</label>
              <input className={inputCls} value={form.point_b} onChange={e => set('point_b', e.target.value)} placeholder="e.g. 5% CTR" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>📅 Action deadline</label>
              <input type="date" className={inputCls} value={form.action_deadline} onChange={e => set('action_deadline', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>📅 Insight deadline</label>
              <input type="date" className={inputCls} value={form.insight_deadline} onChange={e => set('insight_deadline', e.target.value)} />
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>👤 Responsible</label>
              <input className={inputCls} value={form.responsible} onChange={e => set('responsible', e.target.value)} placeholder="Name" />
            </div>
            <div>
              <label className={labelCls}>⭐ Idea score (1–10)</label>
              <input type="number" min={1} max={10} className={inputCls} value={form.idea_score} onChange={e => set('idea_score', e.target.value)} placeholder="7" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>📁 Project</label>
              <select className={inputCls} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— All projects —</option>
                {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>🏷️ Campaign context</label>
              <input className={inputCls} value={form.campaign_context} onChange={e => set('campaign_context', e.target.value)} placeholder="e.g. May retargeting" />
            </div>
          </div>

          {/* D — Data / result */}
          <div>
            <label className={labelCls}>📊 Result / Data</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="What did the data show?"
              value={form.result}
              onChange={e => set('result', e.target.value)}
            />
          </div>

          {/* I — Insight */}
          <div>
            <label className={labelCls}>💡 Insight</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="What did you learn?"
              value={form.insight}
              onChange={e => set('insight', e.target.value)}
            />
          </div>

          {/* Status + Success */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>🔄 Status</label>
              <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>✅ Outcome</label>
              <select className={inputCls} value={form.success === null || form.success === '' ? '' : String(form.success)} onChange={e => set('success', e.target.value)}>
                <option value="">— No verdict —</option>
                <option value="true">Success ✅</option>
                <option value="false">Failed ❌</option>
              </select>
            </div>
          </div>

        </form>

        {/* footer */}
        <div className="px-6 py-4 border-t border-stone-100 flex items-center gap-3 shrink-0">
          <button
            type="submit"
            form="hadi-form"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 bg-stone-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-stone-800 disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Create hypothesis'}
          </button>
          {initial?.id && onDelete && (
            <button
              onClick={() => { onDelete(initial.id); onClose(); }}
              className="px-4 py-2.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/HadiPanel.jsx
git commit -m "feat: add HadiPanel slide-out create/edit form"
```

---

### Task 5: `HadiPage.jsx` — main page

**Files:**
- Create: `client/src/components/HadiPage.jsx`

`★ Insight ─────────────────────────────────────`
The stats are computed **client-side** from the fetched rows — no extra API call needed. This follows the same pattern as `calculations.js` helpers that derive pace/status from raw data. The donut chart uses an SVG `stroke-dasharray` trick: a circle with `r=15.9` has a circumference of `~100` when you use the formula `2π×r ≈ 100`, making the math for "percent of circumference" trivially percentage-based.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Create `HadiPage.jsx`**

```jsx
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
        onClick={() => setOpen(o => !o)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.text} whitespace-nowrap`}
      >
        {meta.label} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden min-w-[130px]">
          {Object.entries(STATUS_META).map(([val, m]) => (
            <button
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

export default function HadiPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    api.getHypotheses()
      .then(setRows)
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
    if (editing?.id) {
      await api.updateHypothesis(editing.id, payload);
    } else {
      await api.createHypothesis(payload);
    }
    load();
  };

  const handleDelete = async (id) => {
    await api.deleteHypothesis(id);
    load();
  };

  const handleStatusChange = async (id, status) => {
    await api.updateHypothesis(id, { status });
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
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

              {/* rows */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-50">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-stone-400 w-[35%]">Hypothesis</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-stone-400 w-[12%]">Project</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-stone-400 w-[12%]">Deadline</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-stone-400 w-[18%]">Insight</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-stone-400 w-[13%]">Status</th>
                    <th className="px-3 py-2.5 w-[10%]" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(row => (
                    <tr
                      key={row.id}
                      className="border-b border-stone-50 last:border-0 hover:bg-stone-50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-stone-900 line-clamp-2">{row.hypothesis}</div>
                        {row.responsible && (
                          <div className="text-xs text-stone-400 mt-0.5">👤 {row.responsible}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {row.project_id ? (
                          <span className="flex items-center gap-1.5 text-xs text-stone-600">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: PROJECT_COLORS[row.project_id] || '#999' }}
                            />
                            {PROJECT_NAMES[row.project_id] || row.project_id}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-stone-500">
                        {row.insight_deadline
                          ? new Date(row.insight_deadline).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-stone-500 max-w-[160px]">
                        <span className="line-clamp-2">{row.insight || '—'}</span>
                      </td>
                      <td className="px-3 py-3">
                        <StatusDropdown
                          value={row.status}
                          onChange={val => handleStatusChange(row.id, val)}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => openEdit(row)}
                          className="text-stone-400 hover:text-stone-700 p-1 rounded transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/HadiPage.jsx
git commit -m "feat: add HadiPage with stats bar, grouped table, inline status"
```

---

### Task 6: Wire up Sidebar + App router

**Files:**
- Modify: `client/src/components/Sidebar.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add HADI nav link to Sidebar**

In `Sidebar.jsx`, inside the `<nav>` section, after the closing `</div>` of the Dashboard NavLink group (around line 64), add a new HADI nav entry inside the same Overview `<div>`:

```jsx
          <NavLink to="/hadi" className={navLink}>
            {({ isActive }) => (
              <>
                <span className="text-base leading-none shrink-0">🚀</span>
                HADI Board
              </>
            )}
          </NavLink>
```

The complete Overview `<div>` will look like:

```jsx
        <div>
          <p className="px-2 pb-2 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
            {t('overview')}
          </p>
          <NavLink to="/dashboard" className={navLink}>
            {({ isActive }) => (
              <>
                <svg className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-stone-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                {t('dashboard')}
              </>
            )}
          </NavLink>
          <NavLink to="/hadi" className={navLink}>
            {({ isActive }) => (
              <>
                <span className="text-base leading-none shrink-0">🚀</span>
                HADI Board
              </>
            )}
          </NavLink>
        </div>
```

- [ ] **Step 2: Add `/hadi` route in App.jsx**

In `App.jsx`, add the import at the top with the other component imports:

```jsx
import HadiPage from './components/HadiPage.jsx';
```

Then inside `<Routes>`, add after the `/workshop` route:

```jsx
          <Route path="/hadi" element={<HadiPage />} />
```

- [ ] **Step 3: Start the dev server and do a smoke test**

```bash
cd C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker
npm run dev
```

Open `http://localhost:5173` (or whatever port Vite chooses). Expected:
- Sidebar shows 🚀 HADI Board link in Overview section
- Clicking it navigates to `/hadi` without white-screen
- Page shows "No hypotheses yet" with "Add the first one" link
- Clicking "+ New hypothesis" opens the slide-out panel
- Creating a hypothesis closes the panel and shows the row in the table
- Status dropdown works inline

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Sidebar.jsx client/src/App.jsx
git commit -m "feat: wire up HADI route and sidebar nav"
```

---

## Post-Implementation Checklist

- [ ] All four CRUD endpoints respond correctly (verify with curl)
- [ ] Table groups rows by `campaign_context`
- [ ] Stats donut reflects real counts
- [ ] Slide-out panel prefills when editing an existing row
- [ ] Delete removes the row and closes panel
- [ ] Inline status dropdown updates without page reload
- [ ] No console errors in browser DevTools
- [ ] Server handles empty DB gracefully (all queries return `[]` not `null`)
