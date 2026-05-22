# Performance Tracker Improvements — Design Spec

**Date:** 2026-05-22  
**Status:** Approved  

## Goal

Four targeted improvements to the existing performance tracker: smart alerts on the dashboard, period-over-period trend badge on project cards, copy-forward targets in Workshop, and a 12-week trend chart on the project page.

## Architecture

All four features are **pure frontend changes**. No new backend routes, no new DB tables, no migrations. All required data is already fetched by existing API calls. Changes are confined to three existing components and one new shared component.

---

## Feature 1: Smart Alerts Banner (Dashboard)

### What it does

A contextual alert section on the Dashboard, displayed between the summary chips and the project grid. Lists every metric that is meaningfully behind pace (pace% < 70%) with specific catch-up math.

**Example output:**
```
⚠️ TSB · Leads — need 45/day for 3 days to hit target
⚠️ FC · Sotuv — need 120/day for 5 days to hit target
```

### Where it lives

`client/src/components/Dashboard.jsx` — new computed section between the entry nudge bar and the project grid.

### Data flow

The data is already available in `projectData` (loaded by the existing `useEffect`). For each project:
1. Take all metrics where pace% < 70%
2. Compute: `needPerDay = ceil((target - actual) / remainingDays)` where `remainingDays = days until period end`
3. Skip metrics where `remainingDays <= 0` or `target <= actual`
4. Render one line per offending metric

### Rendering rules

- Section only renders if ≥1 alert exists
- Red background (`bg-[#FCEBEB]`, `text-[#791F1F]`, `border-[#E24B4A]`) — matches existing color system
- Sorted: worst pace% first
- Inverse metrics (e.g. cost per lead) are excluded — catch-up math doesn't apply to them

---

## Feature 2: Period-over-Period Badge (Dashboard project cards)

### What it does

A small delta badge on each `ProjectCard` showing the change in average pace% vs the previous same-level period.

**Example:**
```
TSB          [78% week]  [↑ +14% vs H3]
```

### Where it lives

`client/src/components/Dashboard.jsx` — inside the existing `ProjectCard` component, in the top row next to the existing week badge.

### Data flow

`pd.periods` (already loaded) contains the full periods list. `pd.data.entries` (already loaded) contains all-time entries. No new API calls.

Steps:
1. Find previous same-level period: last period chronologically before the current one at the same hierarchy level (both week children of the same parent, or both standalone)
2. Compute `prevAvgPct` using the same `pacePercent`/`weeklyPercent` logic as the current period (completed periods use `weeklyPercent`)
3. Delta = `currentAvgPct - prevAvgPct`

### Rendering rules

- `delta > 5%` → green `↑ +N%` badge
- `delta < -5%` → red `↓ -N%` badge  
- `-5% ≤ delta ≤ 5%` → gray `→ ±N%` badge
- Hidden when: no previous period exists, or either pace% is null
- Label: `vs {prevPeriod.name}` (e.g. "vs H3")

---

## Feature 3: Copy-Forward Targets (Workshop → Targets tab)

### What it does

In `TargetsTab`, when the selected period has **no targets yet**, a "Copy from previous" button appears above the form. One click reads all targets from the previous same-level period and upserts them into the current period.

**Example:**
```
[ ← Copy targets from H3 ]
```

### Where it lives

`client/src/components/Workshop/TargetsTab.jsx` — new button rendered when `targets` state is empty and a previous period with targets exists.

### Data flow

1. After the selected period loads and its targets come back empty, check: is there a previous same-level period?
2. If yes, fetch its targets via `api.getTargets({ period_id: prevPeriod.id })`
3. On button click: for each target from prev period, call `api.upsertTarget({ metric_id, period_id: currentPeriodId, weekly_target })`
4. Reload current period's targets after all upserts complete

### Rendering rules

- Button only shows when: a period is selected AND current targets are empty AND a previous same-level period exists AND that period has ≥1 target
- Button shows the previous period's name: `← Copy targets from {prevPeriod.name}`
- While copying: button shows "Copying…" and is disabled
- After copy: targets appear in the form, button disappears (because targets are no longer empty)
- No button if no previous period exists

---

## Feature 4: 12-Week Trend Chart (Project page)

### What it does

A new section at the bottom of each project page showing a line chart of each metric's weekly performance % across the last 12 periods (or all periods if fewer). Each metric gets one colored line. A dotted line at 100% marks the target baseline.

### Where it lives

- New file: `client/src/components/shared/TrendChart.jsx`
- Modify: `client/src/components/ProjectPage.jsx` — add `<TrendChart>` below `<PeriodComparison>`

### Data flow

`allEntries` and `allTargets` and `periods` are already available in `ProjectPage`. Same data used by `PeriodComparison`.

Steps:
1. Take last 12 same-level periods (same logic as `PeriodComparison`: filter by hierarchy level)
2. For each period × metric: compute `weeklyPercent(actual, target)` (completed) or `pacePercent` (current) — same logic as `PeriodComparison`
3. Render as SVG polyline — one line per metric

### TrendChart component interface

```jsx
<TrendChart
  metrics={metrics}           // array of metric objects
  periods={last12Periods}     // array of period objects, sorted oldest→newest
  allEntries={allEntries}     // all entries (unfiltered)
  allTargets={allTargets}     // all targets (unfiltered)
  currentPeriodId={period.id} // to mark the current period
/>
```

### Rendering

- SVG chart, 100% width, fixed height (120px)
- X-axis: period names, evenly spaced
- Y-axis: 0–120%, no labels (clean look)
- Dotted gray line at y=100%
- One `<polyline>` per metric, colored by metric's project color
- Current period marked with a vertical dotted line
- Tooltip on hover: period name + metric value (optional, skip if complex)
- Hidden when fewer than 2 periods have data

---

## File Map

| Action | File |
|--------|------|
| Modify | `client/src/components/Dashboard.jsx` — smart alerts + PoP badge |
| Modify | `client/src/components/Workshop/TargetsTab.jsx` — copy-forward button |
| Create | `client/src/components/shared/TrendChart.jsx` — new chart component |
| Modify | `client/src/components/ProjectPage.jsx` — add TrendChart |

No backend changes. No new API endpoints. No migrations.

---

## Out of Scope

- Confidence bands (deferred to Phase 3 or later)
- Daily standup view (deferred)
- Tooltips on TrendChart hover (optional, skip for now — YAGNI)
- Persisting alert dismissals (alerts recalculate fresh on each load)
