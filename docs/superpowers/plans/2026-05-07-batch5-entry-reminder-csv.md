# Batch 5 — Daily Entry Reminder + CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a red dot on the Quick Entry button when no entry logged today after noon; show an amber nudge bar on Dashboard; add a CSV export button to HistoryTable.

**Architecture:** All client-side. No API changes. QuickEntry detects today's entries from existing period data. Dashboard checks each project's loaded entries. HistoryTable generates a CSV blob client-side.

**Tech Stack:** React 18, Tailwind CSS. Project root: `C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker`

---

## File Map

| File | Change |
|------|--------|
| `client/src/components/QuickEntry.jsx` | Red dot badge on `+` button when no entry today after noon |
| `client/src/components/Dashboard.jsx` | Amber nudge bar below summary pills |
| `client/src/components/shared/HistoryTable.jsx` | Export CSV button + exportCSV function |

---

### Task 1: Red Dot Badge on Quick Entry Button

**Files:**
- Modify: `client/src/components/QuickEntry.jsx`

**Background:** When a project is selected and period data loads, we have the entries. But the "no entry today" check needs to work even before a project is selected — it should check the active project's entries on load. Actually re-reading the spec: the badge is on the `+` button and should appear when the active project (whichever is first/default) has no entry today after noon. Simplest approach: load today's entries for all projects on mount, show badge if ANY has no entry after noon.

A simpler, lower-complexity approach that matches the spec: since QuickEntry doesn't know which project is "active" until the user picks one, we track a `hasTodayEntry` state that loads on mount by checking the active period's entries for the first project. But that's multiple API calls. 

**Even simpler approach that still meets the spec:** After a successful save, set a session flag. On mount, check localStorage for today's date — if it's not today, show the badge. This is purely client-side and requires no extra API calls.

Actually the spec says "In `QuickEntry.jsx`, after loading period data" — so the check happens after a project is selected and data loads. This means: after metrics/targets are loaded for a project, also check if there's an entry today for that project.

Let's implement it per-project (badge appears before selecting a project):
1. Load entries for all projects on QuickEntry mount (using `api.getEntries`)
2. Determine `hasTodayEntry` based on whether any entry exists for today

But that's N API calls. Instead: use a simpler localStorage approach.

**Simplest correct approach:** 
- After a successful `handleSave`, store today's date in `sessionStorage.setItem('lastEntryDate', today())`.
- On QuickEntry mount, after noon: if `sessionStorage.getItem('lastEntryDate') !== today()`, show badge.

This is simpler, correct, and needs no extra API calls.

- [ ] **Step 1: Add `hasTodayEntry` state**

In `client/src/components/QuickEntry.jsx`, add a new state:
```js
const [showBadge, setShowBadge] = useState(false);
```

- [ ] **Step 2: Compute badge visibility on mount**

Add a `useEffect` that runs on mount to decide whether to show the badge:
```js
useEffect(() => {
  const isPastNoon = new Date().getHours() >= 12;
  if (!isPastNoon) { setShowBadge(false); return; }
  const lastEntry = sessionStorage.getItem('lastEntryDate');
  setShowBadge(lastEntry !== today());
}, []);
```

- [ ] **Step 3: Mark entry in sessionStorage on save**

In `handleSave`, after `setSaved(true)`, add:
```js
sessionStorage.setItem('lastEntryDate', today());
setShowBadge(false);
```

- [ ] **Step 4: Add red dot to the `+` button**

Find the floating button (around line 85):
```jsx
<button
  onClick={() => setOpen(true)}
  className="fixed bottom-4 left-4 z-50 w-12 h-12 rounded-full bg-stone-800 text-white shadow-lg flex items-center justify-center text-2xl hover:bg-stone-700 active:scale-95 transition-all select-none"
  title="Quick entry"
>
  +
</button>
```

Wrap it in a `relative` container to position the dot:
```jsx
<div className="fixed bottom-4 left-4 z-50">
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
```

- [ ] **Step 5: Verify in browser**

After noon, clear sessionStorage (DevTools → Application → Session Storage → Clear). Reload the app. Confirm the red dot appears on the `+` button. Click it, log an entry, save. Confirm the dot disappears. Before noon, no dot should appear.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/QuickEntry.jsx
git commit -m "feat: red dot badge on Quick Entry button when no entry logged today after noon"
```

---

### Task 2: Amber Nudge Bar on Dashboard

**Files:**
- Modify: `client/src/components/Dashboard.jsx`

**Background:** Below the summary pills, show a subtle amber bar: "⏰ Don't forget to log today's numbers" when any loaded project has no entries for today after noon. Use existing `projectData` — no extra API calls.

- [ ] **Step 1: Compute `missingTodayEntry` from projectData**

In `Dashboard.jsx`'s `export default function Dashboard()`, after the `campaignBehindCount` computation block, add:
```js
const todayStr2 = new Date().toISOString().slice(0, 10);
const isPastNoon2 = new Date().getHours() >= 12;
const missingTodayEntry = isPastNoon2 && loaded.some(proj => {
  const pd = projectData[proj.id];
  if (!pd?.data) return false;
  const { entries: allEntries2 = [] } = pd.data;
  return !allEntries2.some(e => String(e.date).slice(0, 10) === todayStr2);
});
```

- [ ] **Step 2: Render nudge bar below summary pills**

In the JSX, find the summary bar section (around line 381):
```jsx
{/* Summary bar */}
{loaded.length > 0 && (onTrackCount > 0 || behindCount > 0) && (
  <div className="flex flex-wrap gap-2 mb-6">
    ...
  </div>
)}
```

After this block, add the nudge bar:
```jsx
{missingTodayEntry && (
  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-5 text-sm text-amber-800">
    <span>⏰</span>
    <span>Don't forget to log today's numbers</span>
  </div>
)}
```

- [ ] **Step 3: Verify in browser**

After noon with no entries logged for today: the amber bar should appear on Dashboard. After logging an entry and returning to Dashboard (after a reload): bar should disappear.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Dashboard.jsx
git commit -m "feat: amber nudge bar on Dashboard when any project missing today's entry after noon"
```

---

### Task 3: CSV Export Button in HistoryTable

**Files:**
- Modify: `client/src/components/shared/HistoryTable.jsx`

**Background:** Add a small "Export CSV" button in the top-right of the table header row. On click, generate a CSV blob client-side from all periods (not just visible ones), and trigger a download.

CSV format:
```
Period,Start,End,Metric,Target,Actual,Pct
Hafta 1,2026-05-01,2026-05-07,Sotuv,100,61,61%
```

- [ ] **Step 1: Add exportCSV function**

In `client/src/components/shared/HistoryTable.jsx`, before the `return (...)` statement, add:

```js
const exportCSV = () => {
  const rows = [['Period', 'Start', 'End', 'Metric', 'Target', 'Actual', 'Pct']];
  // Use ALL completed periods (not just visiblePeriods) for a full export
  completedPeriods.forEach(p => {
    metrics.forEach(m => {
      const actual = getActual(p, m.id);
      const target = getTarget(p, m.id);
      const pct = target > 0 ? Math.round((actual / target) * 100) : '';
      rows.push([
        p.name,
        String(p.start_date).slice(0, 10),
        String(p.end_date).slice(0, 10),
        m.name,
        target,
        actual,
        pct !== '' ? `${pct}%` : '',
      ]);
    });
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tracker-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
```

Note: `getActual` was updated in Batch 1 to accept a period object — use it the same way here.

- [ ] **Step 2: Add Export CSV button to table header area**

Find the `<table className="w-full text-sm">` element. Just before it, add a header row with the button:
```jsx
<div className="flex items-center justify-between mb-2">
  <span className="text-xs text-stone-400">{completedPeriods.length} completed period{completedPeriods.length !== 1 ? 's' : ''}</span>
  {completedPeriods.length > 0 && (
    <button
      onClick={exportCSV}
      className="text-xs text-stone-400 hover:text-stone-600 border border-stone-200 rounded px-2 py-0.5 hover:border-stone-400 transition-colors"
    >
      Export CSV
    </button>
  )}
</div>
```

- [ ] **Step 3: Verify in browser**

Navigate to a project page → History section. Confirm the "Export CSV" button appears. Click it — a `.csv` file should download with all historical period data. Open the file in a spreadsheet to verify the data is correct.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/shared/HistoryTable.jsx
git commit -m "feat: CSV export button on HistoryTable with full history download"
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
