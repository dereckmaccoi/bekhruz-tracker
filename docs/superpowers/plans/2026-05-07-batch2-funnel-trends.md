# Batch 2 — Funnel Conversion Rates & Week-over-Week Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show funnel conversion rate between adjacent metrics, and week-over-week trend arrows on each MetricBar.

**Architecture:** Pure client-side calculations. ProjectPage computes last-week actuals and trend deltas, passes `trend` prop to MetricBar. Funnel rate computed from current-week actuals and rendered inline. Dashboard shows funnel footnote.

**Tech Stack:** React 18, Tailwind CSS. Project root: `C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker`

---

## File Map

| File | Change |
|------|--------|
| `client/src/components/ProjectPage.jsx` | Compute lastWeekActual + trend per metric; compute funnel rate; pass trend to MetricBar; render funnel row |
| `client/src/components/shared/MetricBar.jsx` | Accept `trend` prop; render arrow + delta on top row |
| `client/src/components/Dashboard.jsx` | Render funnel rate footnote in metric grid |

---

### Task 1: Add `trend` prop to MetricBar

**Files:**
- Modify: `client/src/components/shared/MetricBar.jsx`

**Background:** MetricBar currently shows metric name and actual/target numbers in its top row. Add a small trend arrow (↑ ↓ →) with a delta value next to the metric name. The arrow shows this week's pace% vs last week's final%.

Prop shape: `trend: { pct: number, delta: number } | null`
- delta > +5 → `↑` green
- delta < -5 → `↓` red
- otherwise → `→` gray

- [ ] **Step 1: Add `trend` to destructured props**

In `client/src/components/shared/MetricBar.jsx`, find the function signature:
```js
export default function MetricBar({ metric, pace }) {
```
Change to:
```js
export default function MetricBar({ metric, pace, trend = null }) {
```

- [ ] **Step 2: Add trend arrow after metric name in top row**

Find the top row (around line 31):
```jsx
<div className="flex items-baseline justify-between mb-2">
  <span className="text-sm font-medium text-stone-700">{metric.name}</span>
```

Change the metric name span to include the trend arrow inline:
```jsx
<div className="flex items-baseline justify-between mb-2">
  <div className="flex items-baseline gap-1.5">
    <span className="text-sm font-medium text-stone-700">{metric.name}</span>
    {trend !== null && (
      <span className={`text-[10px] font-semibold ${
        trend.delta > 5 ? 'text-[#1D9E75]' :
        trend.delta < -5 ? 'text-[#E24B4A]' :
        'text-stone-400'
      }`}>
        {trend.delta > 5 ? '↑' : trend.delta < -5 ? '↓' : '→'}
        {trend.delta > 0 ? ` +${trend.delta}%` : ` ${trend.delta}%`}
      </span>
    )}
  </div>
```

Close the outer div properly — the rest of the top row (actual/target numbers) stays unchanged. Make sure the `justify-between` is on the outer container so numbers stay right-aligned.

- [ ] **Step 3: Verify prop is accepted**

In the browser, navigate to a project page. Confirm MetricBar renders correctly with no errors. The trend arrow won't appear yet (ProjectPage doesn't pass the prop) — that's expected.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/shared/MetricBar.jsx
git commit -m "feat: MetricBar accepts trend prop and renders week-over-week arrow"
```

---

### Task 2: Compute trends and funnel rate in ProjectPage, pass to MetricBar

**Files:**
- Modify: `client/src/components/ProjectPage.jsx`

**Background:** `ProjectPage` already has `siblingPeriods` (sorted sibling weeks or campaigns). The previous period is `siblingPeriods[currentIdx - 1]`. We need to:
1. Compute last week's actual per metric (date-range filter on `data.entries`)
2. Compute `lastWeekPct` using `weeklyPercent` from calculations.js
3. Compare to `pace[m.id].pct` to get delta
4. Compute funnel rate from current-period actuals (adjacent non-inverse metrics by sort_order)

- [ ] **Step 1: Find where `prevPeriod` is defined**

In `client/src/components/ProjectPage.jsx`, find (around line 310):
```js
const currentIdx  = siblingPeriods.findIndex(p => p.id === period?.id);
const prevPeriod  = siblingPeriods[currentIdx - 1] ?? null;
const nextPeriod  = siblingPeriods[currentIdx + 1] ?? null;
```

- [ ] **Step 2: Compute last-week actuals and trend map**

After the `prevPeriod` / `nextPeriod` lines, add:
```js
// Last-week actuals (date-range filter on all loaded entries)
const prevActualMap = {};
if (prevPeriod && data?.entries) {
  const ps = String(prevPeriod.start_date).slice(0, 10);
  const pe = String(prevPeriod.end_date).slice(0, 10);
  data.entries.forEach(e => {
    const d = String(e.date).slice(0, 10);
    if (d >= ps && d <= pe) {
      prevActualMap[e.metric_id] = (prevActualMap[e.metric_id] || 0) + Number(e.value);
    }
  });
}

// Trend per metric: compare this week's pace% to last week's final%
const trendMap = {};
if (prevPeriod && metrics && targets) {
  metrics.forEach(m => {
    const prevActual = prevActualMap[m.id] || 0;
    const tgt = targets.find(t => t.metric_id === m.id);
    const wt = tgt?.weekly_target || 0;
    if (!wt) return;
    const lastWeekPct = weeklyPercent(prevActual, wt, m.type === 'inverse');
    const thisWeekPct = pace[m.id]?.pct ?? null;
    if (lastWeekPct === null || thisWeekPct === null) return;
    trendMap[m.id] = {
      pct: lastWeekPct,
      delta: thisWeekPct - lastWeekPct,
    };
  });
}
```

Note: `weeklyPercent` is already imported from `'../utils/calculations.js'` in ProjectPage.jsx. Confirm the import includes it (line 5 has `weeklyPercent`).

- [ ] **Step 3: Compute funnel conversion rate**

After the `trendMap` block, add:
```js
// Funnel conversion rate: (actual_N+1 / actual_N) * 100 for adjacent non-inverse metrics
// Only compute when both actuals > 0
const nonInverseMetrics = metrics
  .filter(m => m.type !== 'inverse')
  .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

const funnelRates = [];
for (let i = 0; i < nonInverseMetrics.length - 1; i++) {
  const mA = nonInverseMetrics[i];
  const mB = nonInverseMetrics[i + 1];
  // Use period-filtered entries for current week actuals
  const pS = String(period?.start_date).slice(0, 10);
  const pE = String(period?.end_date).slice(0, 10);
  const actualA = (data?.entries || [])
    .filter(e => e.metric_id === mA.id && String(e.date).slice(0,10) >= pS && String(e.date).slice(0,10) <= pE)
    .reduce((s, e) => s + Number(e.value), 0);
  const actualB = (data?.entries || [])
    .filter(e => e.metric_id === mB.id && String(e.date).slice(0,10) >= pS && String(e.date).slice(0,10) <= pE)
    .reduce((s, e) => s + Number(e.value), 0);
  if (actualA > 0 && actualB > 0) {
    // Last week's funnel rate for comparison
    const prevActualA = prevActualMap[mA.id] || 0;
    const prevActualB = prevActualMap[mB.id] || 0;
    const lastRate = prevActualA > 0 && prevActualB > 0
      ? Math.round((prevActualB / prevActualA) * 100)
      : null;
    const thisRate = Math.round((actualB / actualA) * 100);
    const delta = lastRate !== null ? thisRate - lastRate : null;
    funnelRates.push({ from: mA.name, to: mB.name, rate: thisRate, delta });
  }
}
```

- [ ] **Step 4: Pass `trend` prop to MetricBar**

In the `metrics.map(m => ...)` block inside the Metrics section (around line 438):
```jsx
<MetricBar key={m.id} metric={m} pace={pace[m.id]} />
```
Change to:
```jsx
<MetricBar key={m.id} metric={m} pace={pace[m.id]} trend={trendMap[m.id] ?? null} />
```

- [ ] **Step 5: Render funnel row below MetricBar list**

In the Metrics section, after the `<div className="divide-y divide-stone-100">` closing tag (end of metrics map), add the funnel row:
```jsx
{funnelRates.length > 0 && (
  <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap gap-3">
    {funnelRates.map((f, i) => (
      <span key={i} className="text-xs text-stone-500">
        <span className="font-medium text-stone-700">{f.from}</span>
        <span className="mx-1 text-stone-300">→</span>
        <span className="font-medium text-stone-700">{f.to}</span>
        <span className="mx-1.5">·</span>
        <span className="font-semibold text-stone-800">{f.rate}%</span>
        {f.delta !== null && (
          <span className={`ml-1 ${f.delta > 0 ? 'text-[#1D9E75]' : f.delta < 0 ? 'text-[#E24B4A]' : 'text-stone-400'}`}>
            {f.delta > 0 ? `↑ +${f.delta}%` : f.delta < 0 ? `↓ ${f.delta}%` : '→'}
          </span>
        )}
        <span className="text-stone-400 ml-1">conversion</span>
      </span>
    ))}
  </div>
)}
```

The funnel row should be placed inside the Metrics card (`<div className="bg-white border border-stone-200 rounded-xl p-4">`), after the metrics list div closes and before the card div closes.

- [ ] **Step 6: Verify in browser**

Navigate to a project with at least 2 non-inverse metrics and 2 sibling periods. Confirm:
- Each MetricBar shows a trend arrow (↑/↓/→) with delta % (only when a previous sibling period exists)
- The funnel conversion row appears below the metric bars when actuals are > 0

- [ ] **Step 7: Commit**

```bash
git add client/src/components/ProjectPage.jsx
git commit -m "feat: week-over-week trend arrows on MetricBar and funnel conversion rate row"
```

---

### Task 3: Funnel Rate Footnote on Dashboard Cards

**Files:**
- Modify: `client/src/components/Dashboard.jsx`

**Background:** The Dashboard metric grid shows tiles for up to 3 metrics. Add a small footnote line below the grid showing funnel conversion if ≥ 2 non-inverse metrics exist with actuals > 0.

- [ ] **Step 1: Compute funnel rate inside ProjectCard**

In `Dashboard.jsx`, inside `function ProjectCard`, just before the `return (...)` statement, add:
```js
// Funnel rate: first adjacent pair of non-inverse metrics with actuals > 0
const nonInvMetrics = metrics
  .filter(m => m.type !== 'inverse')
  .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

let dashFunnelRate = null;
if (nonInvMetrics.length >= 2) {
  const mA = nonInvMetrics[0];
  const mB = nonInvMetrics[1];
  const aA = actualMap[mA.id] || 0;
  const aB = actualMap[mB.id] || 0;
  if (aA > 0 && aB > 0) {
    dashFunnelRate = {
      from: mA.name,
      to: mB.name,
      rate: Math.round((aB / aA) * 100),
    };
  }
}
```

- [ ] **Step 2: Render footnote below the metric grid**

In the metric grid section, after the closing `</div>` of the grid (after `metrics.slice(0, 3).map(...)`), add:
```jsx
{dashFunnelRate && (
  <p className="text-[10px] text-stone-400 mt-2">
    <span className="font-medium">{dashFunnelRate.from}</span>
    <span className="mx-1">→</span>
    <span className="font-medium">{dashFunnelRate.to}</span>
    <span className="mx-1">·</span>
    <span className="font-semibold text-stone-600">{dashFunnelRate.rate}%</span>
    <span className="ml-1">conversion</span>
  </p>
)}
```

This should be inside the metric grid's container div, after the `{hasTargets ? (...) : (...)}` block.

- [ ] **Step 3: Verify in browser**

On the Dashboard, project cards with ≥ 2 non-inverse metrics and actuals > 0 should show the funnel footnote below the metric grid.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Dashboard.jsx
git commit -m "feat: funnel conversion rate footnote on Dashboard project cards"
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
