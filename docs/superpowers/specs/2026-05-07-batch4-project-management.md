# Batch 4 — Shared Projects Context + Project Management UI

**Date:** 2026-05-07
**Status:** Approved

---

## Problem
The PROJECTS array (id, name, color) is hardcoded in 5 files:
`Sidebar`, `Dashboard`, `QuickEntry`, `RolloverTab`, `TargetsTab`.
Adding/renaming a project requires editing 5 files. There's no UI to manage projects.

The server already has `GET /projects` and the backend supports project data.

---

## Solution

### Part A — Shared ProjectsContext
Create `client/src/context/ProjectsContext.jsx`:
```jsx
export const ProjectsContext = createContext([]);
export function ProjectsProvider({ children }) {
  const [projects, setProjects] = useState([]);
  useEffect(() => {
    api.getProjects().then(setProjects).catch(() => {});
  }, []);
  return <ProjectsContext.Provider value={{ projects, setProjects }}>
    {children}
  </ProjectsContext.Provider>;
}
export const useProjects = () => useContext(ProjectsContext);
```

Wrap `App.jsx` in `<ProjectsProvider>`. Remove hardcoded PROJECTS arrays from all 5 files.
Each component calls `useProjects()` instead.

### Part B — Project Management UI in Workshop
New tab in Workshop: **"Projects"** (between "Periods" and "Targets" in the tab bar).
New file: `client/src/components/Workshop/ProjectsTab.jsx`

#### Features:
- **Project list** — name, color swatch, edit/delete buttons per row
- **Add project** — inline form: name input + color picker (6 preset colors)
- **Edit project** — inline: change name and/or color
- **Delete project** — with confirmation ("This will not delete metrics or entries")

#### Color options (preset swatches, no free-form input):
`#E24B4A` (red), `#1D9E75` (green), `#7F77DD` (purple), `#BA7517` (amber),
`#2563EB` (blue), `#64748B` (slate)

#### API calls used:
- `api.getProjects()` — list
- `api.createProject({ name, color })` — create (re-add to useApi.js)
- `api.updateProject(id, { name, color })` — update (re-add to useApi.js)
- `api.deleteProject(id)` — delete (re-add to useApi.js)

Note: `createProject`, `updateProject`, `deleteProject` were removed from useApi.js in the cleanup
pass. Add them back — they were removed prematurely (the backend routes exist).

After any mutation, call `setProjects` from context to update all consumers instantly.

---

## Files to change
| File | Change |
|------|--------|
| `client/src/context/ProjectsContext.jsx` | Create new file |
| `client/src/App.jsx` | Wrap with ProjectsProvider |
| `client/src/components/Sidebar.jsx` | Replace hardcoded PROJECTS with useProjects() |
| `client/src/components/Dashboard.jsx` | Replace hardcoded PROJECTS with useProjects() |
| `client/src/components/QuickEntry.jsx` | Replace hardcoded PROJECTS with useProjects() |
| `client/src/components/Workshop/RolloverTab.jsx` | Replace hardcoded fallback with useProjects() |
| `client/src/components/Workshop/TargetsTab.jsx` | Replace hardcoded fallback with useProjects() |
| `client/src/components/Workshop/ProjectsTab.jsx` | Create new file |
| `client/src/components/Workshop/index.jsx` | Add Projects tab |
| `client/src/hooks/useApi.js` | Re-add createProject, updateProject, deleteProject |

No database changes (backend already supports full project CRUD).
