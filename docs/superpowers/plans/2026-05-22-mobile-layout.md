# Mobile Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed desktop sidebar with a mobile-native bottom tab bar so the app is usable inside the Telegram Mini App on phones.

**Architecture:** The `AppInner` shell switches from `flex h-screen` (horizontal) to `flex flex-col h-screen` (vertical). The `Sidebar` component is deleted and replaced by a new `BottomNav` fixed to the bottom. A `ProjectPickerSheet` slide-up modal handles project selection. The HADI Board table is replaced with mobile cards.

**Tech Stack:** React 18, React Router v6, Tailwind CSS 3, Vite — no new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `client/index.html` | Modify | Add `viewport-fit=cover` for iOS safe-area support |
| `client/src/components/BottomNav.jsx` | **Create** | 4-tab fixed bottom navigation bar |
| `client/src/components/ProjectPickerSheet.jsx` | **Create** | Slide-up sheet for selecting a project |
| `client/src/App.jsx` | Modify | Vertical shell layout, remove Sidebar, add BottomNav |
| `client/src/components/Workshop/index.jsx` | Modify | Make `setWorkshopActive` prop optional (`?.`) |
| `client/src/components/Sidebar.jsx` | **Delete** | No longer used |
| `client/src/components/Dashboard.jsx` | Modify | Add lang switcher to page header |
| `client/src/components/HadiPage.jsx` | Modify | Replace `<table>` rows with mobile cards |

---

## Task 1: Viewport fix + BottomNav component

**Files:**
- Modify: `client/index.html`
- Create: `client/src/components/BottomNav.jsx`

`BottomNav` depends on `ProjectPickerSheet` (Task 2), but we create both in Tasks 1–2 before wiring them in Task 3. The build will compile correctly as long as Task 2 is done before the build check.

- [ ] **Step 1: Add `viewport-fit=cover` to `client/index.html`**

Replace the existing `<meta name="viewport">` line (currently `content="width=device-width, initial-scale=1.0"`) with:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

Full file after edit:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Bekhruz</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `client/src/components/BottomNav.jsx`**

```jsx
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import ProjectPickerSheet from './ProjectPickerSheet.jsx';

const PROJECTS = [
  { id: 'tsb',  name: 'TSB',           color: '#E24B4A' },
  { id: 'fc',   name: 'Full Contact',  color: '#1D9E75' },
  { id: 'mc',   name: 'Milliard Club', color: '#7F77DD' },
  { id: 'sd',   name: 'Sales Doctor',  color: '#BA7517' },
];

function tabCls(active) {
  return `flex flex-col items-center gap-0.5 flex-1 py-2 text-[10px] font-medium transition-colors ${
    active ? 'text-stone-900' : 'text-stone-400'
  }`;
}

export default function BottomNav() {
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isProjectsActive = location.pathname.startsWith('/project/');

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-100 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Home */}
        <NavLink to="/dashboard" className={({ isActive }) => tabCls(isActive)}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          Home
        </NavLink>

        {/* Projects — opens picker sheet */}
        <button
          onClick={() => setSheetOpen(true)}
          className={tabCls(isProjectsActive)}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          Projects
        </button>

        {/* HADI */}
        <NavLink to="/hadi" className={({ isActive }) => tabCls(isActive)}>
          <span className="text-lg leading-none">🚀</span>
          HADI
        </NavLink>

        {/* Workshop */}
        <NavLink to="/workshop" className={({ isActive }) => tabCls(isActive)}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
          Workshop
        </NavLink>
      </nav>

      <ProjectPickerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projects={PROJECTS}
      />
    </>
  );
}
```

- [ ] **Step 3: Verify no syntax errors**

Run from `client/`:
```bash
npm run build
```
Expected: build succeeds (may warn about missing `ProjectPickerSheet.jsx` — that's fine, we create it next).

Actually Task 2 must be done before this build check. Skip the build check here; do it after Task 2.

---

## Task 2: ProjectPickerSheet component

**Files:**
- Create: `client/src/components/ProjectPickerSheet.jsx`

- [ ] **Step 1: Create `client/src/components/ProjectPickerSheet.jsx`**

```jsx
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function ProjectPickerSheet({ open, onClose, projects }) {
  const navigate = useNavigate();

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const pick = (id) => {
    navigate(`/project/${id}`);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl transition-transform duration-200 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stone-200" />
        </div>

        <div className="px-4 pb-6 pt-2">
          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2 mb-3">
            Projects
          </p>
          <div className="space-y-1">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-stone-50 active:bg-stone-100 transition-colors text-left"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="font-medium text-stone-900 text-sm">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify both new components compile**

Run from `client/`:
```bash
npm run build
```
Expected: build succeeds with no errors. Output ends with something like:
```
✓ built in Xs
```

- [ ] **Step 3: Commit**

```bash
git add client/index.html client/src/components/BottomNav.jsx client/src/components/ProjectPickerSheet.jsx
git commit -m "feat: add BottomNav and ProjectPickerSheet components"
```

---

## Task 3: Refactor App.jsx — remove Sidebar, add BottomNav

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Workshop/index.jsx` (lines 28, 31)
- Delete: `client/src/components/Sidebar.jsx`

`Workshop/index.jsx` must be patched before removing the props from `App.jsx` — otherwise Workshop crashes at runtime when `setWorkshopActive` is `undefined`.

- [ ] **Step 1: Make `setWorkshopActive` optional in `client/src/components/Workshop/index.jsx`**

In `Workshop/index.jsx`, the `useEffect` at line ~28 calls `setWorkshopActive(true)` and the cleanup calls `setWorkshopActive(false)`. Change both to use optional chaining so the prop can be omitted:

Find (lines 28 and 31):
```js
    setWorkshopActive(true);
    // Pick first project if nothing was pre-selected
    if (!initProject && projects.length > 0) setSelectedProject(prev => prev || projects[0].id);
    return () => setWorkshopActive(false);
```

Replace with:
```js
    setWorkshopActive?.(true);
    // Pick first project if nothing was pre-selected
    if (!initProject && projects.length > 0) setSelectedProject(prev => prev || projects[0].id);
    return () => setWorkshopActive?.(false);
```

- [ ] **Step 2: Replace `client/src/App.jsx` entirely**

The new `App.jsx` removes `Sidebar`, `periods`/`activePeriod`/`lastSaved`/`workshopActive` state (they were only used to feed the sidebar), and uses a vertical `flex-col` shell with `BottomNav`:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import BottomNav from './components/BottomNav.jsx';
import Dashboard from './components/Dashboard.jsx';
import ProjectPage from './components/ProjectPage.jsx';
import Workshop from './components/Workshop/index.jsx';
import HadiPage from './components/HadiPage.jsx';
import MusicPlayer from './components/MusicPlayer.jsx';
import QuickEntry from './components/QuickEntry.jsx';
import { api } from './hooks/useApi.js';
import { LangProvider, useLang } from './i18n/LangContext.jsx';
import { ProjectsProvider } from './context/ProjectsContext.jsx';
import PinGate from './components/PinGate.jsx';
import TelegramAuthGate from './components/TelegramAuthGate.jsx';

function AppInner() {
  const { t } = useLang();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.getPeriods().catch(() => setOffline(true));
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-stone-50">
      {offline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#FCEBEB] text-[#791F1F] text-sm text-center py-2 border-b border-[#E24B4A]">
          {t('serverOffline')}
        </div>
      )}
      <main className="flex-1 overflow-y-auto pb-20">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/project/:id" element={<ProjectPage />} />
          <Route path="/workshop" element={<Workshop />} />
          <Route path="/hadi" element={<HadiPage />} />
        </Routes>
      </main>
      <BottomNav />
      <QuickEntry />
      <MusicPlayer />
    </div>
  );
}

export default function App() {
  return (
    <TelegramAuthGate>
      <LangProvider>
        <PinGate>
          <ProjectsProvider>
            <BrowserRouter>
              <AppInner />
            </BrowserRouter>
          </ProjectsProvider>
        </PinGate>
      </LangProvider>
    </TelegramAuthGate>
  );
}
```

- [ ] **Step 3: Delete `client/src/components/Sidebar.jsx`**

```bash
rm client/src/components/Sidebar.jsx
```

- [ ] **Step 4: Verify build succeeds**

Run from `client/`:
```bash
npm run build
```
Expected: no errors. The Sidebar import is gone; Workshop no longer needs `setWorkshopActive` to be defined.

- [ ] **Step 5: Smoke-test in browser**

Run:
```bash
npm run dev
```
Open `http://localhost:5173`. You should see:
- No sidebar
- A bottom tab bar with 4 tabs: Home, Projects, HADI, Workshop
- Tapping Home → dashboard loads
- Tapping Projects → slide-up sheet with 4 project rows
- Tapping a project row → navigates to that project, sheet closes
- Tapping HADI → HADI page loads
- Tapping Workshop → Workshop page loads

- [ ] **Step 6: Commit**

```bash
git add client/src/App.jsx client/src/components/Workshop/index.jsx
git rm client/src/components/Sidebar.jsx
git commit -m "feat: replace sidebar with bottom tab bar"
```

---

## Task 4: Add lang switcher to Dashboard header

**Files:**
- Modify: `client/src/components/Dashboard.jsx`

The EN/RU/UZ lang switcher was in the sidebar. Now it lives in the Dashboard page header.

- [ ] **Step 1: Add `LangSwitcher` component above `Dashboard` in `Dashboard.jsx`**

After the last import at the top of `client/src/components/Dashboard.jsx`, add this helper component (place it just before the `function CardSkeleton` line, around line 66):

```jsx
const LANGS = ['en', 'ru', 'uz'];

function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg shrink-0">
      {LANGS.map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2.5 py-1 text-[11px] rounded-md font-bold transition-all uppercase tracking-wider ${
            lang === l ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-700'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update the Dashboard header `div` to include `LangSwitcher`**

Find the header block inside `Dashboard` (around line 515):
```jsx
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{t('dashboardTitle')}</h1>
          <p className="text-sm text-stone-400 mt-1 capitalize">{today}</p>
        </div>
```

Replace with:
```jsx
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">{t('dashboardTitle')}</h1>
            <p className="text-sm text-stone-400 mt-1 capitalize">{today}</p>
          </div>
          <LangSwitcher />
        </div>
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 4: Verify visually**

Run `npm run dev`, open `/dashboard`. The page header should show the title on the left and EN/RU/UZ pill buttons on the right. Tapping a button should change the UI language and persist on reload.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Dashboard.jsx
git commit -m "feat: move lang switcher to dashboard header"
```

---

## Task 5: HADI Board mobile cards

**Files:**
- Modify: `client/src/components/HadiPage.jsx`

Replace the `<table>` / `<tbody>` row structure inside each campaign group with a `HadiCard` component. The stats bar, filters, and HadiPanel slide-out are unchanged.

- [ ] **Step 1: Add `HadiCard` component to `HadiPage.jsx`**

Add this new component just above the `export default function HadiPage()` line (after the `StatusDropdown` component):

```jsx
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
```

- [ ] **Step 2: Replace the `<table>` block inside each campaign group**

Inside the `groups.map(([campaign, items]) => ...)` render, find the table block:

```jsx
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
```

Replace with:
```jsx
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
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 4: Verify visually**

Run `npm run dev`, open `/hadi`. You should see:
- Campaign group headers with item count badges
- Each hypothesis as a card with status badge, project dot, deadline date, hypothesis text, responsible, and edit button
- Tapping the status badge opens the status dropdown
- Tapping edit opens the HadiPanel slide-out
- Stats donut + counters at the top still render correctly
- Filter row wraps on narrow viewport without overflow

- [ ] **Step 5: Commit and build for production**

```bash
git add client/src/components/HadiPage.jsx
git commit -m "feat: replace HADI board table with mobile cards"
```

Final production build check:
```bash
npm run build
```
Expected: clean build, no warnings about missing files.

---

## Verification Checklist

After all tasks are done, test in the Telegram Mini App on your phone:

- [ ] Bottom tab bar is visible and doesn't overlap page content (content has `pb-20`)
- [ ] Bottom tab bar sits above the iOS home indicator (safe-area respected)
- [ ] Home tab → Dashboard loads with project cards
- [ ] Lang switcher (EN/RU/UZ) is visible in the Dashboard header
- [ ] Projects tab → slide-up sheet shows 4 projects with colored dots
- [ ] Selecting a project → navigates to project page, sheet closes
- [ ] While on a project page → Projects tab is highlighted
- [ ] HADI tab → cards layout (no table)
- [ ] Workshop tab → Workshop page loads
- [ ] No sidebar visible anywhere
- [ ] Offline banner appears when server is unreachable (still works because `api.getPeriods()` still runs in `AppInner`)
