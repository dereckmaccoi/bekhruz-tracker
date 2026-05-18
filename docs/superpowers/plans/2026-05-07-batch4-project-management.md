# Batch 4 — Shared Projects Context + Project Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded PROJECTS arrays in 5 components with a shared React context fed from the server. Add a Project Management tab in Workshop with full CRUD (add/edit/delete projects with name and color swatch).

**Architecture:** New `ProjectsContext` wraps App. Components call `useProjects()`. New `ProjectsTab` in Workshop handles CRUD via re-added API methods. After any mutation, context updates all consumers instantly.

**Tech Stack:** React 18, Tailwind CSS. Backend already supports full project CRUD (`GET/POST/PUT/DELETE /projects`). Project root: `C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker`

---

## File Map

| File | Change |
|------|--------|
| `client/src/context/ProjectsContext.jsx` | **Create** — context + provider + hook |
| `client/src/hooks/useApi.js` | Re-add `createProject`, `updateProject`, `deleteProject` |
| `client/src/App.jsx` | Wrap `AppInner` in `<ProjectsProvider>` |
| `client/src/components/Dashboard.jsx` | Replace hardcoded `PROJECTS` with `useProjects()` |
| `client/src/components/QuickEntry.jsx` | Replace hardcoded `PROJECTS` with `useProjects()` |
| `client/src/components/Workshop/RolloverTab.jsx` | Replace hardcoded fallback with `useProjects()` |
| `client/src/components/Workshop/TargetsTab.jsx` | Replace hardcoded fallback with `useProjects()` |
| `client/src/components/Workshop/ProjectsTab.jsx` | **Create** — project CRUD UI |
| `client/src/components/Workshop/index.jsx` | Add "Projects" tab |

Note: `Sidebar.jsx` and `ProjectPage.jsx` use `PROJECT_META` / no PROJECTS array — check if they need updating. Looking at the codebase, `Sidebar.jsx` may have a PROJECTS array for nav links. **Check `Sidebar.jsx` before starting and add it to this list if needed.**

---

### Task 1: Re-add API methods + create ProjectsContext

**Files:**
- Modify: `client/src/hooks/useApi.js`
- Create: `client/src/context/ProjectsContext.jsx`

- [ ] **Step 1: Re-add createProject, updateProject, deleteProject to useApi.js**

In `client/src/hooks/useApi.js`, in the `api` object after `getProjects`, add:
```js
createProject: (body) => request('/projects', { method: 'POST', body }),
updateProject: (id, body) => request(`/projects/${id}`, { method: 'PUT', body }),
deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 2: Create ProjectsContext.jsx**

Create the file `client/src/context/ProjectsContext.jsx` with this full content:
```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../hooks/useApi.js';

export const ProjectsContext = createContext([]);

export function ProjectsProvider({ children }) {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    api.getProjects().then(setProjects).catch(() => {});
  }, []);

  return (
    <ProjectsContext.Provider value={{ projects, setProjects }}>
      {children}
    </ProjectsContext.Provider>
  );
}

export const useProjects = () => useContext(ProjectsContext);
```

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useApi.js client/src/context/ProjectsContext.jsx
git commit -m "feat: add ProjectsContext and re-add project CRUD API methods"
```

---

### Task 2: Wrap App in ProjectsProvider

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Import ProjectsProvider**

In `client/src/App.jsx`, add the import at the top:
```js
import { ProjectsProvider } from './context/ProjectsContext.jsx';
```

- [ ] **Step 2: Wrap the app**

Find the `export default function App()` at the bottom of `App.jsx`:
```jsx
export default function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </LangProvider>
  );
}
```

Add `<ProjectsProvider>` inside `<LangProvider>`:
```jsx
export default function App() {
  return (
    <LangProvider>
      <ProjectsProvider>
        <BrowserRouter>
          <AppInner />
        </BrowserRouter>
      </ProjectsProvider>
    </LangProvider>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: wrap App in ProjectsProvider for shared projects state"
```

---

### Task 3: Replace hardcoded PROJECTS in Dashboard, QuickEntry

**Files:**
- Modify: `client/src/components/Dashboard.jsx`
- Modify: `client/src/components/QuickEntry.jsx`

**Dashboard.jsx:**

- [ ] **Step 1: Replace PROJECTS in Dashboard**

In `Dashboard.jsx`:
1. Add import at top: `import { useProjects } from '../context/ProjectsContext.jsx';`
2. Delete the hardcoded `const PROJECTS = [...]` array (lines 7-12).
3. Inside `export default function Dashboard()`, add at the top: `const { projects: PROJECTS } = useProjects();`

That's all — every other reference to `PROJECTS` stays the same.

**QuickEntry.jsx:**

- [ ] **Step 2: Replace PROJECTS in QuickEntry**

In `QuickEntry.jsx`:
1. Add import at top: `import { useProjects } from '../context/ProjectsContext.jsx';`
2. Delete the hardcoded `const PROJECTS = [...]` array (lines 5-10).
3. Inside `export default function QuickEntry()`, add at the top: `const { projects: PROJECTS } = useProjects();`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Dashboard.jsx client/src/components/QuickEntry.jsx
git commit -m "refactor: Dashboard and QuickEntry use ProjectsContext instead of hardcoded PROJECTS"
```

---

### Task 4: Replace hardcoded fallback in RolloverTab, TargetsTab

**Files:**
- Modify: `client/src/components/Workshop/RolloverTab.jsx`
- Modify: `client/src/components/Workshop/TargetsTab.jsx`

Both files have a `projectList` local variable that falls back to a hardcoded array when `projects` prop is empty. Replace the fallback with `useProjects()`.

**RolloverTab.jsx:**

- [ ] **Step 1: Replace fallback in RolloverTab**

In `RolloverTab.jsx`:
1. Add import: `import { useProjects } from '../../context/ProjectsContext.jsx';`
2. Inside the component, add: `const { projects: contextProjects } = useProjects();`
3. Find: `const projectList = projects.length > 0 ? projects : [...]` (lines 10-15). Replace with:
```js
const projectList = projects.length > 0 ? projects : contextProjects;
```
(Delete the hardcoded fallback array entirely.)

**TargetsTab.jsx:**

- [ ] **Step 2: Replace fallback in TargetsTab**

In `TargetsTab.jsx`:
1. Add import: `import { useProjects } from '../../context/ProjectsContext.jsx';`
2. Inside the component, add: `const { projects: contextProjects } = useProjects();`
3. Find: `const projectList = projects.length > 0 ? projects : [...]` (lines 18-23). Replace with:
```js
const projectList = projects.length > 0 ? projects : contextProjects;
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Workshop/RolloverTab.jsx client/src/components/Workshop/TargetsTab.jsx
git commit -m "refactor: RolloverTab and TargetsTab fall back to ProjectsContext instead of hardcoded PROJECTS"
```

---

### Task 5: Create ProjectsTab component

**Files:**
- Create: `client/src/components/Workshop/ProjectsTab.jsx`

**Background:** Full CRUD UI for projects. Lists current projects with name + color swatch + edit/delete. Inline form to add/edit. Preset 6 color swatches (no free text).

Color presets: `#E24B4A` (red), `#1D9E75` (green), `#7F77DD` (purple), `#BA7517` (amber), `#2563EB` (blue), `#64748B` (slate).

- [ ] **Step 1: Create the file**

Create `client/src/components/Workshop/ProjectsTab.jsx` with this full content:

```jsx
import { useState } from 'react';
import { api } from '../../hooks/useApi.js';
import { useProjects } from '../../context/ProjectsContext.jsx';

const PRESET_COLORS = [
  '#E24B4A', '#1D9E75', '#7F77DD', '#BA7517', '#2563EB', '#64748B',
];

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full transition-all ${value === c ? 'ring-2 ring-offset-1 ring-stone-700 scale-110' : 'opacity-70 hover:opacity-100 hover:scale-105'}`}
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}
    </div>
  );
}

export default function ProjectsTab() {
  const { projects, setProjects } = useProjects();
  const [editingId, setEditingId]     = useState(null);
  const [editName, setEditName]       = useState('');
  const [editColor, setEditColor]     = useState(PRESET_COLORS[0]);
  const [addingNew, setAddingNew]     = useState(false);
  const [newName, setNewName]         = useState('');
  const [newColor, setNewColor]       = useState(PRESET_COLORS[0]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError]             = useState(null);
  const [saving, setSaving]           = useState(false);

  const startEdit = (project) => {
    setEditingId(project.id);
    setEditName(project.name);
    setEditColor(project.color || PRESET_COLORS[0]);
    setAddingNew(false);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProject(editingId, { name: editName.trim(), color: editColor });
      setProjects(prev => prev.map(p => p.id === editingId ? { ...p, ...updated } : p));
      setEditingId(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (project) => {
    setSaving(true);
    setError(null);
    try {
      await api.deleteProject(project.id);
      setProjects(prev => prev.filter(p => p.id !== project.id));
      setConfirmDelete(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddProject = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.createProject({ name: newName.trim(), color: newColor });
      setProjects(prev => [...prev, created]);
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setAddingNew(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">Projects</h2>
        {!addingNew && (
          <button
            onClick={() => { setAddingNew(true); setEditingId(null); setError(null); }}
            className="text-sm text-stone-500 hover:text-stone-700 flex items-center gap-1"
          >
            <span className="text-lg leading-none">+</span> Add project
          </button>
        )}
      </div>

      {error && (
        <div className="bg-[#FCEBEB] border border-[#E24B4A] rounded-lg px-4 py-3 text-sm text-[#791F1F]">
          {error}
        </div>
      )}

      {/* Project list */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {projects.length === 0 && !addingNew && (
          <p className="px-4 py-6 text-sm text-stone-400 text-center">No projects yet. Add one above.</p>
        )}

        {projects.map(p => (
          <div key={p.id} className="border-b border-stone-100 last:border-0">
            {editingId === p.id ? (
              /* Edit row */
              <div className="px-4 py-3 space-y-3">
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full border border-stone-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-stone-300"
                  autoFocus
                />
                <ColorPicker value={editColor} onChange={setEditColor} />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving || !editName.trim()}
                    className="px-4 py-1.5 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-1.5 border border-stone-200 rounded-lg text-sm text-stone-500 hover:border-stone-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Display row */
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-medium text-stone-800">{p.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(p)}
                    className="text-xs text-stone-400 hover:text-stone-600 underline"
                  >
                    Edit
                  </button>
                  {confirmDelete === p.id ? (
                    <div className="flex gap-1 text-xs">
                      <span className="text-stone-500">Delete? (keeps data)</span>
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={saving}
                        className="text-[#E24B4A] underline"
                      >
                        Yes
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="text-stone-400 underline">
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(p.id)}
                      className="text-stone-300 hover:text-[#E24B4A] transition-colors text-sm"
                      title="Delete project"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add new project row */}
        {addingNew && (
          <div className="border-t border-stone-100 px-4 py-3 space-y-3 bg-stone-50">
            <input
              type="text"
              placeholder="Project name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full border border-stone-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-stone-300"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddProject()}
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <div className="flex gap-2">
              <button
                onClick={handleAddProject}
                disabled={saving || !newName.trim()}
                className="px-4 py-1.5 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
              >
                {saving ? 'Adding…' : 'Add project'}
              </button>
              <button
                onClick={() => { setAddingNew(false); setError(null); }}
                className="px-4 py-1.5 border border-stone-200 rounded-lg text-sm text-stone-500 hover:border-stone-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-stone-400 italic">
        Deleting a project does not delete its metrics, targets, or entries.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file is correct**

Check the import paths are correct: `'../../hooks/useApi.js'` and `'../../context/ProjectsContext.jsx'`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Workshop/ProjectsTab.jsx
git commit -m "feat: ProjectsTab component with add/edit/delete project CRUD"
```

---

### Task 6: Add Projects tab to Workshop

**Files:**
- Modify: `client/src/components/Workshop/index.jsx`

- [ ] **Step 1: Import ProjectsTab**

In `client/src/components/Workshop/index.jsx`, add at the top:
```js
import ProjectsTab from './ProjectsTab.jsx';
```

- [ ] **Step 2: Add tab state value**

Find: `const [tab, setTab] = useState(initTab);  // 'data' | 'targets' | 'rollover'`
The comment lists the tab values. Update it to include `'projects'`.

- [ ] **Step 3: Add Projects button to tab bar**

Find the tab bar buttons. Add a "Projects" button between "Periods" and "Targets":
```jsx
<button
  onClick={() => setTab('projects')}
  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
    tab === 'projects'
      ? 'bg-white text-stone-900 font-medium shadow-sm'
      : 'text-stone-500 hover:text-stone-700'
  }`}
>
  Projects
</button>
```

Insert it between the existing "Periods" button and the "Targets" button.

- [ ] **Step 4: Add ProjectsTab render**

After `{tab === 'rollover' && <RolloverTab ... />}`, add:
```jsx
{tab === 'projects' && <ProjectsTab />}
```

- [ ] **Step 5: Verify in browser**

Navigate to Workshop. Confirm a "Projects" tab appears between Periods and Targets. Click it — the project list renders. Try adding, editing, and deleting a project. Confirm other tabs still work normally. Confirm Dashboard and QuickEntry now show project names from the server.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Workshop/index.jsx
git commit -m "feat: add Projects tab to Workshop with full project management UI"
```

---

## Build & Deploy

- [ ] **Build**
```bash
cd C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker\client
npm run build
```
Expected: no errors.

- [ ] **Deploy**
```bash
scp -r dist/. root@46.62.147.30:/home/bekhruz/tracker/client/dist/
```
