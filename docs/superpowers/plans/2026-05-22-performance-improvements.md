# Performance Tracker Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four pure-frontend features to the performance tracker: smart alert banners on the Dashboard, period-over-period delta badges on project cards, copy-forward targets in Workshop, and a 12-week SVG trend chart on the project page.

**Architecture:** All four features are pure frontend changes. No new backend routes, no DB migrations. All required data is already fetched by existing API calls. The calculations helpers (`pacePercent`, `weeklyPercent`, `colorKey`, `COLOR_CLASSES`) in `calculations.js` are reused throughout.

**Tech Stack:** React 18, Vite, Tailwind CSS, SVG (no chart library), existing `calculations.js` helpers.

---

## File Map

| Action | File |
|--------|------|
| Modify | `client/src/components/Dashboard.jsx` — Tasks 1 and 2 |
| Modify | `client/src/components/Workshop/TargetsTab.jsx` — Task 3 |
| Create | `client/src/components/shared/TrendChart.jsx` — Task 4 |
| Modify | `client/src/components/ProjectPage.jsx` — Task 4 |

---

## Task 1: Smart Alerts Banner (Dashboard)

**Files:**
- Modify: `client/src/components/Dashboard.jsx`

A red banner listing every metric that is behind pace (< 70%) across all projects, with specific catch-up math: `⚠️ TSB · Leads — need 45/day for 3 days to hit target`. Placed between the entry nudge bar and the project grid. Sorted worst first. Inverse metrics excluded.

- [ ] **Step 1: Open Dashboard.jsx and locate the insertion point**

  Open `client/src/components/Dashboard.jsx`. Find the "Entry nudge bar" comment around line 450 and the "Project grid" comment around line 458. The alerts banner will be inserted between these two blocks, right before the `{/* Project grid */}` line.

- [ ] **Step 2: Add `pacePercent` import — verify it's already imported**

  Line 4 already imports `pacePercent` from `../utils/calculations.js`. No change needed.

- [ ] **Step 3: Add the smart alerts computation inside the `Dashboard` component**

  In `Dashboard()`, after the `campaignBehindCount` block (around line 408) and before the `return (`, add:

  ```js
  // Smart alerts: metrics behind pace with catch-up math
  const todayStr = new Date().toISOString().slice(0, 10);
  const smartAlerts = [];
  loaded.forEach(proj => {
    const pd = projectData[proj.id];
    if (!pd?.data || !pd?.period) return;
    const { metrics = [], targets = [], entries: allEntries = [] } = pd.data;
    const pStart = String(pd.period.start_date).slice(0, 10);
    const pEnd   = String(pd.period.end_date).slice(0, 10);
    const periodEntries = allEntries.filter(e => {
      const d = String(e.date).slice(0, 10);
      return d >= pStart && d <= pEnd;
    });
    const actualMap = {};
    periodEntries.forEach(e => {
      actualMap[e.metric_id] = (actualMap[e.metric_id] || 0) + Number(e.value);
    });
    const remainingDays = todayStr <= pEnd
      ? Math.max(1, Math.round((new Date(pEnd) - new Date(todayStr)) / 86400000) + 1)
      : 0;
    if (remainingDays === 0) return;
    metrics.forEach(m => {
      if (m.is_inverse) return;
      const tgt = targets.find(t => t.metric_id === m.id);
      if (!tgt) return;
      const actual = actualMap[m.id] || 0;
      const pct = pacePercent(actual, tgt.weekly_target, pd.period, false);
      if (pct === null || pct >= 70) return;
      const needPerDay = Math.ceil((tgt.weekly_target - actual) / remainingDays);
      if (needPerDay <= 0) return;
      smartAlerts.push({
        projName: proj.name,
        metricName: m.name,
        needPerDay,
        remainingDays,
        pct,
      });
    });
  });
  smartAlerts.sort((a, b) => a.pct - b.pct);
  ```

- [ ] **Step 4: Render the alerts banner in JSX**

  In the `return (` block, find the `{/* Entry nudge bar */}` block. Right after its closing `)}` and before `{/* Project grid */}`, insert:

  ```jsx
  {/* Smart alerts */}
  {smartAlerts.length > 0 && (
    <div className="bg-[#FCEBEB] border border-[#E24B4A] rounded-xl px-4 py-3 mb-5 space-y-1">
      {smartAlerts.map((a, i) => (
        <div key={i} className="flex items-center gap-2 text-sm text-[#791F1F]">
          <span>⚠️</span>
          <span>
            <span className="font-semibold">{a.projName} · {a.metricName}</span>
            {' — '}need {a.needPerDay}/day for {a.remainingDays} day{a.remainingDays !== 1 ? 's' : ''} to hit target
          </span>
        </div>
      ))}
    </div>
  )}
  ```

- [ ] **Step 5: Test manually**

  Start the dev server (`npm run dev` in `client/`). Open the Dashboard. If any project has a metric at < 70% pace with days remaining, the red banner should appear with the correct `need X/day for Y days` text. If all are on track, temporarily change the threshold to `>= 0` to verify the banner renders, then revert.

- [ ] **Step 6: Commit**

  ```bash
  git add client/src/components/Dashboard.jsx
  git commit -m "feat: add smart alerts banner to dashboard"
  ```

---

## Task 2: Period-over-Period Delta Badge (Dashboard Project Cards)

**Files:**
- Modify: `client/src/components/Dashboard.jsx` — inside `ProjectCard`

A small delta badge next to the existing "week badge" on each project card: `↑ +14% vs H3` in green, or `↓ -8% vs H3` in red, or `→ +2% vs H3` in gray. Hidden when no previous same-level period exists or either pace% is null.

- [ ] **Step 1: Import `weeklyPercent` — verify it's already imported**

  Check line 4 of `Dashboard.jsx`. `weeklyPercent` may not be imported yet. The current import is:
  ```js
  import { pacePercent, colorKey, formatNum, COLOR_CLASSES, detectActivePeriod, resolveTarget } from '../utils/calculations.js';
  ```
  Add `weeklyPercent` to the import:
  ```js
  import { pacePercent, weeklyPercent, colorKey, formatNum, COLOR_CLASSES, detectActivePeriod, resolveTarget } from '../utils/calculations.js';
  ```

- [ ] **Step 2: Compute `popBadge` inside `ProjectCard`**

  In `ProjectCard`, after the `avgPct` computation (around line 131), add:

  ```js
  // Period-over-period badge
  const sameLevelPeriods = period?.parent_id
    ? (periods || []).filter(p => p.parent_id === period.parent_id)
    : (periods || []).filter(p => !p.parent_id);
  const sortedSame = [...sameLevelPeriods].sort((a, b) =>
    String(a.start_date).localeCompare(String(b.start_date))
  );
  const currentIdx = sortedSame.findIndex(p => p.id === period.id);
  const prevPeriod = currentIdx > 0 ? sortedSame[currentIdx - 1] : null;

  let popBadge = null;
  if (prevPeriod && avgPct !== null) {
    const prevStart = String(prevPeriod.start_date).slice(0, 10);
    const prevEnd   = String(prevPeriod.end_date).slice(0, 10);
    const prevEntries = allEntries.filter(e => {
      const d = String(e.date).slice(0, 10);
      return d >= prevStart && d <= prevEnd;
    });
    const prevActualMap = {};
    prevEntries.forEach(e => {
      prevActualMap[e.metric_id] = (prevActualMap[e.metric_id] || 0) + Number(e.value);
    });
    // Prev period is always completed (it's in the past) — use weeklyPercent
    const prevPcts = metrics.map(m => {
      const tgt = targetMap[m.id];
      if (!tgt) return null;
      return weeklyPercent(prevActualMap[m.id] || 0, tgt.weekly_target, !!m.is_inverse);
    }).filter(p => p !== null);
    const prevAvgPct = prevPcts.length
      ? Math.round(prevPcts.reduce((a, b) => a + b, 0) / prevPcts.length)
      : null;
    if (prevAvgPct !== null) {
      const delta = avgPct - prevAvgPct;
      popBadge = { delta, prevName: prevPeriod.name };
    }
  }
  ```

- [ ] **Step 3: Render the badge in JSX**

  In `ProjectCard`'s JSX, find the top row section:
  ```jsx
  <div className="flex items-center justify-between gap-2">
    <span className="font-bold text-stone-900 text-base leading-tight">{project.name}</span>
    {hasTargets && avgPct !== null && (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${c.tag}`}>
        {avgPct}% week
      </span>
    )}
  </div>
  ```

  Replace it with:
  ```jsx
  <div className="flex items-center justify-between gap-2 flex-wrap">
    <span className="font-bold text-stone-900 text-base leading-tight">{project.name}</span>
    <div className="flex items-center gap-1.5 flex-wrap">
      {hasTargets && avgPct !== null && (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${c.tag}`}>
          {avgPct}% week
        </span>
      )}
      {popBadge !== null && (() => {
        const { delta, prevName } = popBadge;
        const isGreen = delta > 5;
        const isRed   = delta < -5;
        const arrow   = isGreen ? '↑' : isRed ? '↓' : '→';
        const sign    = delta > 0 ? '+' : '';
        const cls     = isGreen
          ? 'bg-[#E1F5EE] text-[#085041] border border-[#1D9E75]'
          : isRed
          ? 'bg-[#FCEBEB] text-[#791F1F] border border-[#E24B4A]'
          : 'bg-[#F1EFE8] text-[#444441] border border-stone-300';
        return (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${cls}`}>
            {arrow} {sign}{delta}% vs {prevName}
          </span>
        );
      })()}
    </div>
  </div>
  ```

- [ ] **Step 4: Test manually**

  Reload the Dashboard. Each project card with a previous same-level period should show the delta badge. Cards on the first period ever (no predecessor) should show no badge. Verify colors: > +5% is green, < -5% is red, in between is gray.

- [ ] **Step 5: Commit**

  ```bash
  git add client/src/components/Dashboard.jsx
  git commit -m "feat: add period-over-period delta badge to project cards"
  ```

---

## Task 3: Copy-Forward Targets (Workshop → Targets Tab)

**Files:**
- Modify: `client/src/components/Workshop/TargetsTab.jsx`

When the selected period has no targets yet, show a `← Copy targets from H3` button above the form. One click copies all targets from the previous same-level period into the current one via `api.upsertTarget`. The button disappears once targets exist.

- [ ] **Step 1: Add `copySource` and `copying` state at the top of `TargetsTab`**

  In `TargetsTab.jsx`, after the existing `useState` declarations (around line 37), add:

  ```js
  const [copySource, setCopySource] = useState(null); // { period, targets: [] } | null
  const [copying, setCopying]       = useState(false);
  ```

- [ ] **Step 2: Detect copy opportunity after targets load**

  In the `Promise.all` `.then()` callback (around line 88), after the existing `m.forEach(metric => { ... })` block and the `setTargets(tMap)` call (which happens a few lines later in the file), add logic to set `copySource`.

  First read the rest of the effect to see where `setTargets`, `setTypes`, `setInverses`, `setCampaignTotals` are called. They're after the `m.forEach` loop. Right after those `set*` calls, add:

  ```js
  // Check if we should offer copy-forward
  const hasAnyTarget = m.some(metric =>
    t.find(x => x.metric_id === metric.id && x.period_id === selectedPeriodId && x.weekly_target > 0)
  );
  if (!hasAnyTarget && m.length > 0) {
    const selPer = periodList.find(p => p.id === selectedPeriodId);
    const sameLevel = selPer?.parent_id
      ? periodList.filter(p => p.parent_id === selPer.parent_id)
      : periodList.filter(p => !p.parent_id);
    const sorted = [...sameLevel].sort((a, b) =>
      String(a.start_date).localeCompare(String(b.start_date))
    );
    const idx = sorted.findIndex(p => p.id === selectedPeriodId);
    const prev = idx > 0 ? sorted[idx - 1] : null;
    if (prev) {
      api.getTargets({ project_id: selectedProject, period_id: prev.id }).then(prevTargets => {
        if (prevTargets.length > 0) {
          setCopySource({ period: prev, targets: prevTargets });
        } else {
          setCopySource(null);
        }
      }).catch(() => setCopySource(null));
    } else {
      setCopySource(null);
    }
  } else {
    setCopySource(null);
  }
  ```

  Also add `setCopySource(null)` at the very top of the `.then()` callback (before processing) to reset it on every load:
  ```js
  setCopySource(null);
  ```

- [ ] **Step 3: Implement the `handleCopyTargets` function**

  After the existing `handleSave` function (or wherever handlers are defined), add:

  ```js
  async function handleCopyTargets() {
    if (!copySource || copying) return;
    setCopying(true);
    try {
      await Promise.all(
        copySource.targets.map(ct =>
          api.upsertTarget({
            metric_id:     ct.metric_id,
            period_id:     selectedPeriodId,
            weekly_target: ct.weekly_target,
          })
        )
      );
      // Reload targets — this will also clear copySource since targets are now present
      const [m, t] = await Promise.all([
        api.getMetrics(selectedProject),
        api.getTargets({ project_id: selectedProject, period_id: selectedPeriodId }),
      ]);
      const tMap = {};
      t.forEach(tgt => { tMap[tgt.metric_id] = String(tgt.weekly_target); });
      setTargets(tMap);
      setCopySource(null);
    } catch (err) {
      setError('Failed to copy targets. Please try again.');
    } finally {
      setCopying(false);
    }
  }
  ```

- [ ] **Step 4: Render the copy button in JSX**

  In the JSX `return (` block of `TargetsTab`, find where the targets form starts (where `{metrics.map(...)}` renders the input rows). Before that block, insert:

  ```jsx
  {/* Copy-forward button */}
  {copySource && (
    <button
      type="button"
      onClick={handleCopyTargets}
      disabled={copying}
      className="flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-3"
    >
      <span>←</span>
      <span>{copying ? 'Copying…' : `Copy targets from ${copySource.period.name}`}</span>
    </button>
  )}
  ```

- [ ] **Step 5: Test manually**

  1. In Workshop, select a project and a period that has no targets yet, but whose previous same-level period does have targets. The copy button should appear.
  2. Click it. It should show "Copying…", then disappear once the targets load.
  3. Verify the target input fields are populated with the previous period's values.
  4. For a period that already has targets, the button should not appear.
  5. For the very first period (no previous), the button should not appear.

- [ ] **Step 6: Commit**

  ```bash
  git add client/src/components/Workshop/TargetsTab.jsx
  git commit -m "feat: add copy-forward targets button in workshop"
  ```

---

## Task 4: 12-Week Trend Chart (Project Page)

**Files:**
- Create: `client/src/components/shared/TrendChart.jsx`
- Modify: `client/src/components/ProjectPage.jsx`

An SVG line chart at the bottom of each project page showing each metric's weekly performance % over the last 12 same-level periods. One colored `<polyline>` per metric, a dotted 100% reference line, period names on x-axis, current period marked with a dotted vertical line. Hidden when fewer than 2 periods have data.

### Sub-task 4a: Create `TrendChart.jsx`

- [ ] **Step 1: Create the file**

  Create `client/src/components/shared/TrendChart.jsx` with:

  ```jsx
  import { weeklyPercent, pacePercent } from '../../utils/calculations.js';

  /**
   * SVG line chart of weekly performance % across the last N periods.
   *
   * Props:
   *   metrics         — array of metric objects { id, name, is_inverse }
   *   periods         — array of period objects sorted oldest → newest (up to 12)
   *   allEntries      — all-time entries (unfiltered)
   *   allTargets      — all targets (unfiltered)
   *   currentPeriodId — marks the active period with a vertical dotted line
   */
  export default function TrendChart({ metrics, periods, allEntries, allTargets, currentPeriodId }) {
    if (!metrics?.length || !periods?.length) return null;

    const W = 600;
    const H = 120;
    const PAD_LEFT   = 8;
    const PAD_RIGHT  = 8;
    const PAD_TOP    = 10;
    const PAD_BOTTOM = 22; // room for x-axis labels

    const chartW = W - PAD_LEFT - PAD_RIGHT;
    const chartH = H - PAD_TOP - PAD_BOTTOM;

    const today = new Date().toISOString().slice(0, 10);

    // For each period × metric, compute the performance %
    const seriesData = metrics.map(m => {
      const points = periods.map((p, i) => {
        const pStart = String(p.start_date).slice(0, 10);
        const pEnd   = String(p.end_date).slice(0, 10);
        const isCompleted = pEnd < today;

        const periodEntries = allEntries.filter(e => {
          const d = String(e.date).slice(0, 10);
          return d >= pStart && d <= pEnd;
        });
        const actual = periodEntries.reduce((sum, e) => {
          if (e.metric_id === m.id) return sum + Number(e.value);
          return sum;
        }, 0);

        // Find target: period-specific first, then fallback to campaign
        const tgt = allTargets.find(t => t.period_id === p.id && t.metric_id === m.id)
          || (p.parent_id ? allTargets.find(t => t.period_id === p.parent_id && t.metric_id === m.id) : null);

        if (!tgt?.weekly_target) return { x: i, pct: null };

        const pct = isCompleted
          ? weeklyPercent(actual, tgt.weekly_target, !!m.is_inverse)
          : pacePercent(actual, tgt.weekly_target, p, !!m.is_inverse);

        return { x: i, pct };
      });
      return { metric: m, points };
    });

    // Only render if ≥ 2 periods have any data for any metric
    const periodsWithData = periods.filter((_, i) =>
      seriesData.some(s => s.points[i]?.pct !== null)
    );
    if (periodsWithData.length < 2) return null;

    const n = periods.length;

    function xPos(i) {
      if (n === 1) return PAD_LEFT + chartW / 2;
      return PAD_LEFT + (i / (n - 1)) * chartW;
    }

    function yPos(pct) {
      // 0% → bottom, 120% → top (clamped to 0–120%)
      const clamped = Math.max(0, Math.min(120, pct));
      return PAD_TOP + chartH - (clamped / 120) * chartH;
    }

    // Build polyline points string for a series, skipping null gaps
    function buildPolylines(points) {
      const segments = [];
      let current = [];
      points.forEach(pt => {
        if (pt.pct !== null) {
          current.push(`${xPos(pt.x).toFixed(1)},${yPos(pt.pct).toFixed(1)}`);
        } else {
          if (current.length >= 2) segments.push(current.join(' '));
          current = [];
        }
      });
      if (current.length >= 2) segments.push(current.join(' '));
      return segments;
    }

    // Assign colors: use metric's project color if available, else cycle through defaults
    const PALETTE = ['#1D9E75', '#EF9F27', '#E24B4A', '#4A90D9', '#9B59B6', '#E67E22'];
    function metricColor(m, idx) {
      return PALETTE[idx % PALETTE.length];
    }

    const currentIdx = periods.findIndex(p => p.id === currentPeriodId);

    return (
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
          12-week trend
        </h2>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          className="overflow-visible"
        >
          {/* 100% reference line */}
          <line
            x1={PAD_LEFT}
            y1={yPos(100)}
            x2={W - PAD_RIGHT}
            y2={yPos(100)}
            stroke="#D6D3CB"
            strokeWidth="1"
            strokeDasharray="4 3"
          />

          {/* Current period vertical marker */}
          {currentIdx >= 0 && (
            <line
              x1={xPos(currentIdx)}
              y1={PAD_TOP}
              x2={xPos(currentIdx)}
              y2={PAD_TOP + chartH}
              stroke="#B5B1A8"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {/* Metric polylines */}
          {seriesData.map((s, idx) => {
            const color = metricColor(s.metric, idx);
            const segments = buildPolylines(s.points);
            return segments.map((pts, si) => (
              <polyline
                key={`${s.metric.id}-${si}`}
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.9"
              />
            ));
          })}

          {/* X-axis period labels */}
          {periods.map((p, i) => {
            // Show label for first, last, and current period; skip dense middle labels
            const showLabel = i === 0 || i === n - 1 || p.id === currentPeriodId
              || (n <= 6) || (i % Math.ceil(n / 6) === 0);
            if (!showLabel) return null;
            const name = p.name?.length > 5 ? p.name.slice(0, 5) : p.name;
            return (
              <text
                key={p.id}
                x={xPos(i)}
                y={H - 4}
                textAnchor="middle"
                fontSize="9"
                fill={p.id === currentPeriodId ? '#444441' : '#A09D96'}
                fontWeight={p.id === currentPeriodId ? '600' : '400'}
              >
                {name}
              </text>
            );
          })}
        </svg>

        {/* Metric legend */}
        {metrics.length > 1 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {seriesData.map((s, idx) => (
              <div key={s.metric.id} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-0.5 rounded-full"
                  style={{ backgroundColor: metricColor(s.metric, idx) }}
                />
                <span className="text-xs text-stone-500">{s.metric.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify the file is created correctly**

  Check it exists:
  ```bash
  ls client/src/components/shared/
  ```
  Expected: `TrendChart.jsx` is present.

### Sub-task 4b: Integrate TrendChart into ProjectPage

- [ ] **Step 3: Import TrendChart in ProjectPage.jsx**

  In `client/src/components/ProjectPage.jsx`, find the existing imports at the top. Add:
  ```js
  import TrendChart from './shared/TrendChart.jsx';
  ```

- [ ] **Step 4: Compute `trendPeriods` for TrendChart**

  In `ProjectPage.jsx`, find where `sortedPeriods` is computed (used by `PeriodComparison`). After that computation, add:

  ```js
  // Last 12 same-level periods for trend chart (oldest → newest)
  const trendPeriods = sortedPeriods.slice(-12);
  ```

  If `sortedPeriods` is not already in scope or uses a different name, check the file. `PeriodComparison` receives `periods={sortedPeriods}` — use the same variable.

- [ ] **Step 5: Add `<TrendChart>` after `<PeriodComparison>`**

  In the JSX, find:
  ```jsx
  {/* Period Comparison — week mode only */}
  {tab === 'week' && hasTargets && sortedPeriods.length >= 2 && (
    <PeriodComparison
      metrics={metrics}
      periods={sortedPeriods}
      allEntries={entries}
      allTargets={targets}
      currentPeriodId={period?.id}
    />
  )}
  ```

  Right after the closing `)}` of this block, add:

  ```jsx
  {/* 12-week trend chart */}
  {tab === 'week' && hasTargets && trendPeriods.length >= 2 && (
    <TrendChart
      metrics={metrics}
      periods={trendPeriods}
      allEntries={entries}
      allTargets={targets}
      currentPeriodId={period?.id}
    />
  )}
  ```

- [ ] **Step 6: Test manually**

  Navigate to a project page. Below the Period Comparison section, the trend chart should appear with colored polylines per metric, a dotted 100% reference line, and period name labels. On a project with fewer than 2 periods of data, the chart should not render. Verify the current period is marked with a dotted vertical line.

- [ ] **Step 7: Commit**

  ```bash
  git add client/src/components/shared/TrendChart.jsx client/src/components/ProjectPage.jsx
  git commit -m "feat: add 12-week trend chart to project page"
  ```

---

## Self-Review Checklist

- [ ] Feature 1 (smart alerts): banner renders between nudge bar and grid; sorted worst-first; inverse metrics excluded; hidden when no alerts
- [ ] Feature 2 (PoP badge): green for >+5%, red for <-5%, gray otherwise; hidden for first-ever period; `weeklyPercent` used for completed prev period
- [ ] Feature 3 (copy-forward): button only when current has no targets AND prev period has targets; disappears after copy; "Copying…" disabled state
- [ ] Feature 4 (trend chart): SVG, 100% dotted line, metric legend for multi-metric; hidden when <2 periods have data; current period marked
- [ ] No backend changes, no new API endpoints, no migrations
- [ ] All code uses existing `pacePercent`, `weeklyPercent`, `colorKey`, `COLOR_CLASSES` from `calculations.js`
