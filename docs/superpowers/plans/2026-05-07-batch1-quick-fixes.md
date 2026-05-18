# Batch 1 — Quick Fixes & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 small UI/logic issues: HistoryTable date-range bug, remove Read Only badge, DayChart today marker, Dashboard "at this rate" projection, Dashboard catch-up lines.

**Architecture:** Pure client-side React changes across 4 files. No API or backend changes. Each task is isolated — no cross-task dependencies.

**Tech Stack:** React 18, Tailwind CSS, Vite. Project root: `C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker`

---

## File Map

| File | Change |
|------|--------|
| `client/src/components/shared/HistoryTable.jsx` | Fix `getActual` to filter by date range |
| `client/src/components/ProjectPage.jsx` | Remove Read Only badge |
| `client/src/components/shared/DayChart.jsx` | Add today marker on today's bar |
| `client/src/components/Dashboard.jsx` | "At this rate" projection + "Need X/day" lines |

---

### Task 1: Fix HistoryTable Date-Range Bug

**Files:**
- Modify: `client/src/components/shared/HistoryTable.jsx`

**Background:** `getActual` on line 21 filters by `e.period_id === periodId`. This is wrong because entries saved before per-project periods were added may have a different `period_id`. Every other component filters by date range. Fix: change `getActual` to accept a period object and filter by `start_date ≤ e.date ≤ end_date`.

- [ ] **Step 1: Read the file**

Open `client/src/components/shared/HistoryTable.jsx`. Locate `getActual` at line 21:
```js
const getActual = (periodId, metricId) => {
  const entries = allEntries?.filter(e => e.period_id === periodId && e.metric_id === metricId) || [];
  return entries.reduce((s, e) => s + Number(e.value), 0);
};
```
Also note its two call sites at lines ~72 and ~95: `getActual(period.id, m.id)`.

- [ ] **Step 2: Replace `getActual` with date-range version**

Replace the entire `getActual` function (lines 21-24) with:
```js
const getActual = (period, metricId) => {
  const s = String(period.start_date).slice(0, 10);
  const e = String(period.end_date).slice(0, 10);
  return (allEntries || [])
    .filter(en => en.metric_id === metricId && String(en.date).slice(0, 10) >= s && String(en.date).slice(0, 10) <= e)
    .reduce((sum, en) => sum + Number(en.value), 0);
};
```

- [ ] **Step 3: Update call sites**

Inside `periodScore`, find `getActual(period.id, m.id)` and change to `getActual(period, m.id)`.

Inside the `visiblePeriods.map(period => ...)` block, find `getActual(period.id, m.id)` (two occurrences in the metrics map) and change both to `getActual(period, m.id)`.

- [ ] **Step 4: Verify in browser**

Run `cd client && npm run dev` (if not already running). Navigate to any ProjectPage → scroll to History section → expand a period row. Confirm actual values match what you'd expect from the date range (not zero).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/shared/HistoryTable.jsx
git commit -m "fix: HistoryTable getActual uses date-range filter instead of period_id"
```

---

### Task 2: Remove "Read Only" Badge from ProjectPage

**Files:**
- Modify: `client/src/components/ProjectPage.jsx`

**Background:** There is a `<span>` rendering `{t('readOnly')}` in the header area. It conveys no useful info and confuses users. Delete it.

- [ ] **Step 1: Locate the badge**

In `client/src/components/ProjectPage.jsx`, find the span (around line 376):
```jsx
<span className="text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-400 border border-stone-200">
  {t('readOnly')}
</span>
```

- [ ] **Step 2: Delete the span**

Remove the entire `<span>` element (3 lines). Do not touch anything else in the header area.

- [ ] **Step 3: Verify in browser**

Navigate to any project page. Confirm the "Read Only" badge is gone. Confirm the period navigation and pace badge still appear correctly.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ProjectPage.jsx
git commit -m "fix: remove misleading Read Only badge from ProjectPage header"
```

---

### Task 3: DayChart "Today" Marker

**Files:**
- Modify: `client/src/components/shared/DayChart.jsx`

**Background:** The DayChart renders bars for every day in the period. Users can't tell which bar is today. Add a small dot above today's bar and bold the date number.

- [ ] **Step 1: Read DayChart.jsx**

Open `client/src/components/shared/DayChart.jsx`. Locate the `days.map(d => ...)` block (around line 63). The variable `key` is `d.toISOString().slice(0, 10)`. The variable `today` is a Date object set to midnight (line 33).

- [ ] **Step 2: Compute `todayKey` and `isToday` inside the map**

Just after `const weekend = isWeekend(d);` (inside the map), add:
```js
const todayKey = today.toISOString().slice(0, 10);
const isToday = key === todayKey;
```

- [ ] **Step 3: Add today dot above the bar**

Replace the return value's inner structure. Currently the bar container is:
```jsx
<div className="w-full flex items-end" style={{ height: '7rem' }}>
  <div
    className={`w-full rounded-t transition-all ${BAR_COLORS[color]} ${weekend ? 'opacity-70' : ''}`}
    style={{ height: hasData || isFuture ? `${Math.max(6, heightPct)}%` : '6%' }}
    title={hasData ? `${formatNum(value)}` : (isFuture ? 'future' : 'no data')}
  />
</div>
```

Change the outer `<div>` wrapper to `flex-col justify-end` and add the dot at the top:
```jsx
<div className="w-full flex flex-col items-center justify-end" style={{ height: '7rem' }}>
  {isToday && (
    <div className="w-1.5 h-1.5 rounded-full bg-stone-700 mb-0.5 shrink-0" />
  )}
  <div
    className={`w-full rounded-t transition-all ${BAR_COLORS[color]} ${weekend ? 'opacity-70' : ''}`}
    style={{ height: hasData || isFuture ? `${Math.max(6, heightPct)}%` : '6%' }}
    title={hasData ? `${formatNum(value)}` : (isFuture ? 'future' : 'no data')}
  />
</div>
```

- [ ] **Step 4: Bold today's date label**

Find the date label at the bottom of the map:
```jsx
<span className="text-[9px] text-stone-400">{d.getDate()}</span>
```

Change to:
```jsx
<span className={`text-[9px] ${isToday ? 'font-bold text-stone-700' : 'text-stone-400'}`}>{d.getDate()}</span>
```

- [ ] **Step 5: Verify in browser**

Navigate to any project page → Day by Day section → select a metric. Find today's date in the chart. Confirm: small dark dot above the bar, bold date number below.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/shared/DayChart.jsx
git commit -m "feat: add today marker (dot + bold date) on DayChart current day bar"
```

---

### Task 4: Dashboard "At This Rate" Projection + "Need X/day" Catch-up Lines

**Files:**
- Modify: `client/src/components/Dashboard.jsx`

**Background:** The campaign bar already shows `campaignElapsed of campaignDays days`. Add a projected final % at this rate. Also, each metric tile shows actual vs target — add a "Need X/day" line when behind.

- [ ] **Step 1: Add projection to the campaign bar**

In `Dashboard.jsx`, inside `function ProjectCard`, find the campaign bar section (around line 207):
```jsx
<div className="flex items-center justify-between mb-1">
  <span className="text-[11px] text-stone-500 font-medium">
    {campaignPeriod.name} · {campaignElapsed} of {campaignDays} days
  </span>
  <span className={`text-[11px] font-semibold ${cC?.text || 'text-stone-500'}`}>
    {avgCampaignPct}%
  </span>
</div>
```

**Before** the `<div className="flex items-center justify-between mb-1">`, compute the projection:
```js
const projectedPct = campaignElapsed >= 3 && campaignDays > 0
  ? Math.round(avgCampaignPct * campaignDays / campaignElapsed)
  : null;
```

Then change the label span to include the projection:
```jsx
<span className="text-[11px] text-stone-500 font-medium">
  {campaignPeriod.name} · {campaignElapsed} of {campaignDays} days
  {projectedPct !== null && (
    <span className={`ml-1 ${projectedPct >= 100 ? 'text-[#085041]' : 'text-[#791F1F]'}`}>
      · on track for {projectedPct}%
    </span>
  )}
</span>
```

- [ ] **Step 2: Add "Need X/day" lines to metric tiles**

In `Dashboard.jsx`, inside `function ProjectCard`, find the metric grid section. Each metric tile currently looks like (around line 267):
```jsx
<div key={m.id} className="bg-stone-50 rounded-xl px-3 py-2.5 min-w-0">
  <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wide truncate mb-1">{m.name}</p>
  <p className="text-base font-bold text-stone-800 leading-tight truncate">{formatNum(actual)}</p>
  {tgt && (
    <p className="text-[11px] text-stone-400 leading-tight">/ {formatNum(tgt.weekly_target)}</p>
  )}
  {tgt && (
    <Sparkline entries={metricEntries} period={period} dailyTarget={dt} />
  )}
</div>
```

**Before** `return (` inside the `metrics.slice(0, 3).map(m => ...)` callback, add catch-up computation. Find where `const pDays = ...` and `const dt = ...` are computed and add after them:

```js
const todayStr2 = new Date().toISOString().slice(0, 10);
const pStart2 = String(period.start_date).slice(0, 10);
const pEnd2   = String(period.end_date).slice(0, 10);
const daysElapsed2 = Math.max(0, Math.min(
  pDays,
  Math.floor((new Date(todayStr2) - new Date(pStart2)) / 86400000) + 1
));
const daysLeft2 = Math.max(0, pDays - daysElapsed2);
const expected2 = dt * daysElapsed2;
const isInverseMetric = m.type === 'inverse';
const needPerDay = tgt && !isInverseMetric && actual < expected2 && daysLeft2 > 0
  ? Math.ceil((tgt.weekly_target - actual) / daysLeft2)
  : null;
```

Then, after the `<Sparkline .../>` line and inside the tile div, add:
```jsx
{needPerDay !== null && (
  <p className="text-[10px] text-amber-600 font-medium mt-0.5">
    Need {formatNum(needPerDay)}/day
  </p>
)}
```

- [ ] **Step 3: Verify in browser**

Navigate to Dashboard. On a project card with a campaign bar: confirm "· on track for X%" appears in the label, green if X >= 100, red otherwise. On metric tiles where actual < expected by today: confirm "Need Y/day" appears in amber text.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Dashboard.jsx
git commit -m "feat: add at-this-rate projection on campaign bar and need-X/day on metric tiles"
```

---

## Build & Deploy

After all tasks pass visual verification:

- [ ] **Build**
```bash
cd C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker\client
npm run build
```
Expected: "built in Xs" with no errors.

- [ ] **Deploy**
```bash
scp -r dist/. root@46.62.147.30:/home/bekhruz/tracker/client/dist/
```
