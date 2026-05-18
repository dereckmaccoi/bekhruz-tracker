# Campaign Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all campaign-metric logic bugs — target resolution, period navigation, scope toggle, dashboard badges, and rollover.

**Architecture:** Pure frontend changes. A new `resolveTarget()` utility provides campaign→week fallback everywhere targets are looked up. ProjectPage gains a `scope` state (`'week'|'campaign'`) that switches rendering mode. Dashboard loads campaign context per project card for a second badge.

**Tech Stack:** React 18, Vite, Tailwind CSS, Supabase (via existing API layer). No test framework — verification is manual in the browser at `46.62.147.30:8080`. Deploy: `npm run build` → `scp` → `chmod 755`.

---

## File Map

| File | Change |
|---|---|
| `client/src/utils/calculations.js` | Add `resolveTarget()` |
| `client/src/hooks/usePace.js` | Use `resolveTarget`, expose `campaignCompletionPct` |
| `client/src/components/shared/MetricBar.jsx` | Render campaign completion badge |
| `client/src/components/ProjectPage.jsx` | Sibling nav, breadcrumb, scope state, campaign mode |
| `client/src/components/Dashboard.jsx` | Load campaign period, two badges, summary counter |
| `client/src/components/Workshop/TargetsTab.jsx` | Save campaign targets on campaign `period_id` |
| `client/src/components/QuickEntry.jsx` | Use `detectActivePeriod` for period resolution |
| `client/src/components/shared/HistoryTable.jsx` | Use `resolveTarget`, receive sibling periods only |
| `client/src/components/Workshop/RolloverTab.jsx` | Use period-object-based target resolution |

---

## Task 1: `resolveTarget()` utility

**Files:**
- Modify: `client/src/utils/calculations.js`

- [ ] **Step 1: Add `resolveTarget` to calculations.js**

Open `client/src/utils/calculations.js` and add this export after the existing `detectActivePeriod` function:

```js
// Resolve target for a metric in a period.
// First checks for a period-specific target (week override).
// Falls back to the parent campaign's target when none exists.
export function resolveTarget(targets, metricId, period) {
  if (!targets || !period) return null;
  return targets.find(t => t.period_id === period.id && t.metric_id === metricId)
      || (period.parent_id
          ? targets.find(t => t.period_id === period.parent_id && t.metric_id === metricId)
          : null);
}
```

- [ ] **Step 2: Verify the function is exported correctly**

The file already exports named functions. Confirm `resolveTarget` appears in the export list (it uses `export function`, so it's fine).

---

## Task 2: Update `usePace` — use `resolveTarget`, expose `campaignCompletionPct`

**Files:**
- Modify: `client/src/hooks/usePace.js`

- [ ] **Step 1: Import `resolveTarget`**

At the top of `client/src/hooks/usePace.js`, add `resolveTarget` to the import:

```js
import {
  pacePercent,
  expectedByToday,
  dailyTarget,
  colorKey,
  statusLabel,
  formatNum,
  resolveTarget,
} from '../utils/calculations.js';
```

- [ ] **Step 2: Replace the inline target lookup with `resolveTarget`**

Find this block (around line 32–33):

```js
    const targetMap = {};
    targets.forEach(t => { targetMap[t.metric_id] = t; });
```

And this usage (around line 57):

```js
      const target      = targetMap[m.id];
      const weeklyTarget = target?.weekly_target || 0;
```

Replace the `targetMap` block and all usages with `resolveTarget`. The full updated `usePace` body becomes:

```js
  return useMemo(() => {
    if (!metrics || !targets || !period) return {};

    // Normal entries summed by metric (current week scope)
    const actualMap = {};
    entries?.forEach(e => {
      actualMap[e.metric_id] = (actualMap[e.metric_id] || 0) + Number(e.value);
    });

    // Campaign-scope entries summed by metric (full campaign duration)
    const campaignActualMap = {};
    campaignEntries?.forEach(e => {
      campaignActualMap[e.metric_id] = (campaignActualMap[e.metric_id] || 0) + Number(e.value);
    });

    // Days remaining in current period including today
    const todayStr   = new Date().toISOString().slice(0, 10);
    const endStr     = String(period.end_date).slice(0, 10);
    const remainingDays = todayStr <= endStr
      ? Math.ceil((new Date(endStr) - new Date(todayStr)) / 86400000) + 1
      : 0;

    const result = {};
    metrics.forEach(m => {
      // Use resolveTarget: prefers week-specific target, falls back to campaign target
      const target       = resolveTarget(targets, m.id, period);
      const weeklyTarget = target?.weekly_target || 0;
      const isCampaign   = m.type === 'campaign';
      const isInverse    = m.type === 'inverse';

      const effectivePeriod = isCampaign && campaignPeriod ? campaignPeriod : period;
      const actual = isCampaign && campaignEntries
        ? (campaignActualMap[m.id] || 0)
        : (actualMap[m.id] || 0);

      const pct      = pacePercent(actual, weeklyTarget, effectivePeriod, isInverse);
      const expected = expectedByToday(weeklyTarget, effectivePeriod);
      const dt       = dailyTarget(weeklyTarget, effectivePeriod);
      const color    = colorKey(pct, isInverse);
      const status   = statusLabel(pct, isInverse);
      const gap      = actual - expected;

      const isAhead = isInverse ? gap <= 0 : gap >= 0;
      const gapLabel = isAhead
        ? `+${formatNum(Math.abs(gap))} ahead of today's pace (${formatNum(expected)})`
        : `−${formatNum(Math.abs(gap))} behind today's pace (${formatNum(expected)})`;

      const endEffective = String(effectivePeriod.end_date).slice(0, 10);
      const remainingEffective = todayStr <= endEffective
        ? Math.ceil((new Date(endEffective) - new Date(todayStr)) / 86400000) + 1
        : 0;

      const shortfall = weeklyTarget - actual;
      const catchUpPerDay = !isInverse && !isCampaign && shortfall > 0 && remainingDays > 0
        ? Math.ceil(shortfall / remainingDays)
        : isCampaign && shortfall > 0 && remainingEffective > 0
        ? Math.ceil(shortfall / remainingEffective)
        : null;

      // Raw campaign completion % (actual / campaign total) — used for the header badge
      const campaignCompletionPct = isCampaign && weeklyTarget
        ? Math.round((actual / weeklyTarget) * 100)
        : null;

      result[m.id] = {
        actual,
        weeklyTarget,
        pct,
        expected,
        dailyTarget: dt,
        color,
        status,
        gap,
        isAhead,
        gapLabel,
        catchUpPerDay,
        remainingDays: isCampaign ? remainingEffective : remainingDays,
        isInverse,
        isCampaign,
        campaignCompletionPct,
      };
    });

    return result;
  }, [metrics, targets, entries, period, campaignPeriod, campaignEntries]);
```

- [ ] **Step 3: Verify in browser**

Open any project page. Open browser console. No errors. Metrics section still renders with pace bars.

---

## Task 3: MetricBar — campaign completion badge

**Files:**
- Modify: `client/src/components/shared/MetricBar.jsx`

- [ ] **Step 1: Destructure `isCampaign` and `campaignCompletionPct` from pace**

Find line 7:
```js
  const { actual, weeklyTarget, pct, color, gap, expected, isInverse,
          isAhead, catchUpPerDay, remainingDays } = pace;
```

Replace with:
```js
  const { actual, weeklyTarget, pct, color, gap, expected, isInverse,
          isAhead, catchUpPerDay, remainingDays, isCampaign,
          campaignCompletionPct } = pace;
```

- [ ] **Step 2: Add campaign badge next to the actual/target numbers**

Find the header row (around line 29–35):
```js
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-stone-700">{metric.name}</span>
        <span className="text-sm text-stone-500">
          <span className="font-semibold text-stone-800">{formatNum(actual)}</span>
          <span className="text-stone-300 mx-1.5">/</span>
          {formatNum(weeklyTarget)}
        </span>
      </div>
```

Replace with:
```js
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-stone-700">{metric.name}</span>
        <div className="flex items-baseline gap-2">
          {isCampaign && campaignCompletionPct !== null && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium">
              {campaignCompletionPct}% of goal
            </span>
          )}
          <span className="text-sm text-stone-500">
            <span className="font-semibold text-stone-800">{formatNum(actual)}</span>
            <span className="text-stone-300 mx-1.5">/</span>
            {formatNum(weeklyTarget)}
          </span>
        </div>
      </div>
```

- [ ] **Step 3: Verify in browser**

Open Full Contact project page. Sotuv (Campaign type) should show a small `[X% of goal]` badge to the left of `61 / 400` in the header. Non-campaign metrics should be unchanged.

---

## Task 4: ProjectPage — sibling navigation + breadcrumb + scope state

**Files:**
- Modify: `client/src/components/ProjectPage.jsx`

- [ ] **Step 1: Add `scope` state at the top of the component**

After the existing `useState` declarations (around line 161), add:
```js
  const [scope, setScope] = useState('week'); // 'week' | 'campaign'
```

- [ ] **Step 2: Reset scope when project changes**

Find the `useEffect` that depends on `[id]` (line 169). Add `setScope('week')` inside it:

```js
  useEffect(() => {
    setData(null);
    setSelectedMetricId(null);
    setScope('week');
    api.getPeriods({ project_id: id }).then(ps => {
      setProjectPeriods(ps);
      setPeriod(detectActivePeriod(ps));
    }).catch(() => {});
  }, [id]);
```

- [ ] **Step 3: Replace period navigation with sibling-only logic**

Find around line 282:
```js
  // Period navigation
  const sortedPeriods = [...projectPeriods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const currentIdx = sortedPeriods.findIndex(p => p.id === period?.id);
  const prevPeriod = sortedPeriods[currentIdx - 1] ?? null;
  const nextPeriod = sortedPeriods[currentIdx + 1] ?? null;
```

Replace with:
```js
  // Period navigation — arrows step through sibling periods only.
  // In week mode: navigate among weeks with the same parent_id.
  // In campaign mode: navigate among top-level campaigns (no parent_id).
  const sortedPeriods = [...projectPeriods].sort((a, b) => a.start_date.localeCompare(b.start_date));

  const siblingPeriods = scope === 'campaign'
    ? sortedPeriods.filter(p => !p.parent_id)
    : period?.parent_id
      ? sortedPeriods.filter(p => p.parent_id === period.parent_id)
      : sortedPeriods.filter(p => !p.parent_id);

  const currentIdx  = siblingPeriods.findIndex(p => p.id === period?.id);
  const prevPeriod  = siblingPeriods[currentIdx - 1] ?? null;
  const nextPeriod  = siblingPeriods[currentIdx + 1] ?? null;

  // Parent campaign (if current period is a week)
  const parentCampaign = period?.parent_id
    ? projectPeriods.find(p => p.id === period.parent_id) ?? null
    : null;
```

- [ ] **Step 4: Add breadcrumb + scope toggle to the header**

Find the header section (around line 293–316). Replace the period span and arrows with:

```js
      {/* Breadcrumb: campaign name (clickable to switch to campaign scope) */}
      {parentCampaign && scope === 'week' && (
        <button
          onClick={() => { setScope('campaign'); setPeriod(parentCampaign); }}
          className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
        >
          {parentCampaign.name}
        </button>
      )}
      {parentCampaign && scope === 'week' && (
        <span className="text-stone-300 text-sm">›</span>
      )}

      {/* Period navigation */}
      {period && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => prevPeriod && setPeriod(prevPeriod)}
            disabled={!prevPeriod}
            className="w-5 h-5 flex items-center justify-center rounded text-stone-400 hover:text-stone-600 disabled:opacity-25 text-sm"
          >←</button>
          <span className="text-sm text-stone-400">
            {period.name} · {String(period.start_date).slice(8,10)}/{String(period.start_date).slice(5,7)} – {String(period.end_date).slice(8,10)}/{String(period.end_date).slice(5,7)}
          </span>
          <button
            onClick={() => nextPeriod && setPeriod(nextPeriod)}
            disabled={!nextPeriod}
            className="w-5 h-5 flex items-center justify-center rounded text-stone-400 hover:text-stone-600 disabled:opacity-25 text-sm"
          >→</button>
        </div>
      )}

      {/* In campaign mode: chip to zoom back into active week */}
      {scope === 'campaign' && parentCampaign === null && (() => {
        const activeWeek = projectPeriods.find(p => {
          const today = new Date().toISOString().slice(0, 10);
          return p.parent_id === period?.id &&
            String(p.start_date).slice(0, 10) <= today &&
            String(p.end_date).slice(0, 10) >= today;
        });
        return activeWeek ? (
          <button
            onClick={() => { setScope('week'); setPeriod(activeWeek); }}
            className="text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
          >
            ↓ {activeWeek.name}
          </button>
        ) : null;
      })()}
```

- [ ] **Step 5: Verify navigation in browser**

On Full Contact project, arrows should now step only between Hafta 1, Hafta 2, etc. — never jumping to "May". Clicking "May ›" in the breadcrumb should switch the header to show May with campaign-level arrows.

---

## Task 5: ProjectPage — campaign mode rendering

**Files:**
- Modify: `client/src/components/ProjectPage.jsx`

- [ ] **Step 1: Compute campaign-mode pace when scope is 'campaign'**

After the existing `pace` line (line ~216), add:

```js
  // In campaign mode, compute pace using the campaign period for ALL metrics.
  const campaignScopePace = usePace(
    data?.metrics,
    data?.targets,
    campaignEntries ?? periodEntries,
    campaignPeriod ?? period,
    null,
    null,
  );

  const activePace = scope === 'campaign' ? campaignScopePace : pace;
```

Then replace all `pace[m.id]` references in the render with `activePace[m.id]`.

- [ ] **Step 2: Update section title based on scope**

Find the metrics section title (around line 332):
```js
          {t('thisWeekMetrics')}
```
Replace with:
```js
          {scope === 'campaign' ? 'THIS CAMPAIGN — METRICS' : t('thisWeekMetrics')}
```

- [ ] **Step 3: Hide PeriodComparison in campaign mode**

Find the PeriodComparison render (around line 354–363). Wrap it:
```js
      {/* Period Comparison — week mode only */}
      {scope === 'week' && hasTargets && sortedPeriods.length >= 2 && (
        <PeriodComparison
          metrics={metrics}
          periods={sortedPeriods}
          allEntries={entries}
          allTargets={targets}
          currentPeriodId={period?.id}
        />
      )}
```

- [ ] **Step 4: Pass sibling periods to HistoryTable**

Find the HistoryTable render (around line 444). Currently it receives `sortedPeriods`. Replace with sibling periods in week mode:

```js
        <HistoryTable
          metrics={metrics}
          periods={scope === 'week' ? siblingPeriods : sortedPeriods.filter(p => !p.parent_id)}
          allEntries={entries}
          allTargets={targets}
        />
```

- [ ] **Step 5: Update DayChart period in campaign mode**

Find the DayChart render (around line 386–393). The `period` prop should use campaign period in campaign mode:

```js
          <DayChart
            metric={selectedMetric}
            entries={selectedEntries}
            period={scope === 'campaign' ? (campaignPeriod ?? period) : period}
            weeklyTarget={selectedTarget?.weekly_target || 0}
          />
```

- [ ] **Step 6: Update targets table daily equiv for campaign mode**

Find the targets table rows (around line 418–430). Update `dt` calculation:

```js
              const wt = tgt?.weekly_target || 0;
              const dtPeriod = (m.type === 'campaign' || scope === 'campaign')
                ? (campaignPeriod ?? period)
                : period;
              const dt = dtPeriod ? dailyTarget(wt, dtPeriod) : 0;
```

- [ ] **Step 7: Verify campaign mode in browser**

Click "May ›" breadcrumb on Full Contact. Section title should read "THIS CAMPAIGN — METRICS". Arrows should navigate between campaigns (if multiple exist). PeriodComparison should disappear. Click "↓ Hafta 1" chip to zoom back into week mode.

---

## Task 6: TargetsTab — save campaign targets on campaign `period_id`

**Files:**
- Modify: `client/src/components/Workshop/TargetsTab.jsx`

- [ ] **Step 1: Update `handleSave` to use campaign period for campaign metrics**

Find `handleSave` (around line 82):
```js
  const handleSave = async () => {
    setSaving(true); setError(null); setSaveOk(false);
    try {
      await Promise.all(
        metrics.map(m => api.upsertTarget({
          metric_id: m.id,
          period_id: selectedPeriodId,
          weekly_target: Number(targets[m.id] || 0),
        }))
      );
```

Replace with:
```js
  const handleSave = async () => {
    setSaving(true); setError(null); setSaveOk(false);
    try {
      await Promise.all(
        metrics.map(m => {
          const metricType = types[m.id] || m.type;
          // Campaign metrics: store the target on the campaign period, not the week.
          // This makes it available to all sibling weeks via resolveTarget fallback.
          const savePeriodId = metricType === 'campaign' && campaignPeriod
            ? campaignPeriod.id
            : selectedPeriodId;
          return api.upsertTarget({
            metric_id: m.id,
            period_id: savePeriodId,
            weekly_target: Number(targets[m.id] || 0),
          });
        })
      );
```

- [ ] **Step 2: Update `handleAddMetric` similarly**

Find `handleAddMetric` (around line 109). The `upsertTarget` call inside it:
```js
      if (newMetric.target) {
        await api.upsertTarget({
          metric_id: id, period_id: selectedPeriodId,
          weekly_target: Number(newMetric.target),
        });
      }
```

Replace with:
```js
      if (newMetric.target) {
        const savePeriodId = newMetric.type === 'campaign' && campaignPeriod
          ? campaignPeriod.id
          : selectedPeriodId;
        await api.upsertTarget({
          metric_id: id, period_id: savePeriodId,
          weekly_target: Number(newMetric.target),
        });
      }
```

- [ ] **Step 3: Verify in Workshop**

Go to Workshop → Targets. Select Full Contact, select Hafta 1. Set a campaign metric target and hit Save. Then select Hafta 2 — the campaign metric should show the same target (resolved via parent campaign).

---

## Task 7: Dashboard — campaign period loading + two badges

**Files:**
- Modify: `client/src/components/Dashboard.jsx`

- [ ] **Step 1: Store periods per project in state**

Find the `useState` for `projectData` (line 224):
```js
  const [projectData, setProjectData] = useState({});
```

This stays the same. Update the `useEffect` to also store `periods`:

```js
  useEffect(() => {
    PROJECTS.forEach(proj => {
      setProjectData(prev => ({ ...prev, [proj.id]: { loading: true } }));
      api.getPeriods({ project_id: proj.id })
        .then(periods => {
          const period = detectActivePeriod(periods);
          if (!period) {
            setProjectData(prev => ({ ...prev, [proj.id]: { period: null, data: null, periods, loading: false } }));
            return null;
          }
          return api.getProject(proj.id, period.id).then(data => {
            setProjectData(prev => ({ ...prev, [proj.id]: { period, data, periods, loading: false } }));
          });
        })
        .catch(() => {
          setProjectData(prev => ({ ...prev, [proj.id]: { loading: false, error: true } }));
        });
    });
  }, []);
```

- [ ] **Step 2: Import `resolveTarget` in Dashboard**

Find the import line at the top of Dashboard.jsx:
```js
import { pacePercent, colorKey, formatNum, COLOR_CLASSES, detectActivePeriod } from '../utils/calculations.js';
```
Replace with:
```js
import { pacePercent, colorKey, formatNum, COLOR_CLASSES, detectActivePeriod, resolveTarget } from '../utils/calculations.js';
```

- [ ] **Step 3: Compute campaign badge in `ProjectCard`**

`ProjectCard` receives `project`, `period`, `data`. Also pass `periods` from `projectData`:

Find the ProjectCard render (around line 310):
```js
            return (
              <ProjectCard
                key={p.id}
                project={p}
                period={pd.period}
                data={pd.data}
              />
            );
```
Replace with:
```js
            return (
              <ProjectCard
                key={p.id}
                project={p}
                period={pd.period}
                data={pd.data}
                periods={pd.periods || []}
              />
            );
```

- [ ] **Step 4: Update `ProjectCard` signature and compute campaign badge**

Find `function ProjectCard({ project, period, data })` (line 92). Replace with:

```js
function ProjectCard({ project, period, data, periods = [] }) {
```

Then inside `ProjectCard`, after the `actualMap` block (around line 128), add:

```js
  // Campaign badge: average campaign-completion % for campaign-type metrics only
  const campaignPeriod = period?.parent_id
    ? (periods || []).find(p => p.id === period.parent_id) ?? null
    : null;

  const cStart = campaignPeriod ? String(campaignPeriod.start_date).slice(0, 10) : '';
  const cEnd   = campaignPeriod ? String(campaignPeriod.end_date).slice(0, 10) : '';
  const campaignActualMap = {};
  if (campaignPeriod) {
    (data?.entries || []).forEach(e => {
      const d = String(e.date).slice(0, 10);
      if (d >= cStart && d <= cEnd) {
        campaignActualMap[e.metric_id] = (campaignActualMap[e.metric_id] || 0) + Number(e.value);
      }
    });
  }

  const campaignMetrics = metrics.filter(m => m.type === 'campaign');
  const campaignPcts = campaignMetrics.map(m => {
    const tgt = resolveTarget(targets, m.id, period);
    if (!tgt?.weekly_target) return null;
    const actual = campaignActualMap[m.id] || 0;
    return Math.round((actual / tgt.weekly_target) * 100);
  }).filter(p => p !== null);

  const avgCampaignPct = campaignPcts.length > 0
    ? Math.round(campaignPcts.reduce((a, b) => a + b, 0) / campaignPcts.length)
    : null;
  const campaignColor = avgCampaignPct !== null ? colorKey(avgCampaignPct, false) : null;
  const cC = campaignColor ? (COLOR_CLASSES[campaignColor] || COLOR_CLASSES.gray) : null;
```

- [ ] **Step 5: Render the second badge in ProjectCard header**

Find the badge area (around line 164–168):
```js
          <div className="shrink-0 text-right">
            <span className={`inline-block text-sm font-bold px-2.5 py-1 rounded-xl ${c.tag}`}>
              {avgPct !== null ? `${avgPct}%` : '—'}
            </span>
            <p className="text-[11px] text-stone-400 mt-1 text-right">{statusLabel}</p>
          </div>
```

Replace with:
```js
          <div className="shrink-0 text-right flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              {cC && avgCampaignPct !== null && (
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-lg ${cC.tag}`}>
                  {avgCampaignPct}% camp.
                </span>
              )}
              <span className={`inline-block text-sm font-bold px-2.5 py-1 rounded-xl ${c.tag}`}>
                {avgPct !== null ? `${avgPct}%` : '—'}
              </span>
            </div>
            <p className="text-[11px] text-stone-400">{statusLabel}</p>
          </div>
```

- [ ] **Step 6: Add "N behind campaign" to summary bar**

Find the summary bar section (around line 287). After `behindCount > 0` block, add a `campaignBehindCount`:

Before the `return (` of the `Dashboard` component, add:
```js
  let campaignBehindCount = 0;
  loaded.forEach(proj => {
    const pd = projectData[proj.id];
    if (!pd?.data || !pd?.period) return;
    const { metrics = [], targets = [], entries: allEntries = [] } = pd.data;
    const campaignPeriod = pd.period?.parent_id
      ? (pd.periods || []).find(p => p.id === pd.period.parent_id) ?? null
      : null;
    if (!campaignPeriod) return;
    const cStart = String(campaignPeriod.start_date).slice(0, 10);
    const cEnd   = String(campaignPeriod.end_date).slice(0, 10);
    const camActualMap = {};
    allEntries.forEach(e => {
      const d = String(e.date).slice(0, 10);
      if (d >= cStart && d <= cEnd) {
        camActualMap[e.metric_id] = (camActualMap[e.metric_id] || 0) + Number(e.value);
      }
    });
    const camMetrics = metrics.filter(m => m.type === 'campaign');
    const camPcts = camMetrics.map(m => {
      const tgt = resolveTarget(targets, m.id, pd.period);
      if (!tgt?.weekly_target) return null;
      return Math.round(((camActualMap[m.id] || 0) / tgt.weekly_target) * 100);
    }).filter(p => p !== null);
    const avg = camPcts.length ? Math.round(camPcts.reduce((a, b) => a + b, 0) / camPcts.length) : null;
    if (avg !== null && avg < 70) campaignBehindCount++;
  });
```

Then in the summary bar JSX, after the `behindCount > 0` pill, add:
```jsx
            {campaignBehindCount > 0 && (
              <div className="flex items-center gap-2 bg-white border border-stone-100 shadow-sm rounded-xl px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-[#EF9F27]" />
                <span className="text-sm font-medium text-stone-700">
                  {campaignBehindCount} behind campaign
                </span>
              </div>
            )}
```

- [ ] **Step 7: Verify in browser**

Dashboard should show two badges on project cards that have campaign metrics with a parent campaign. Projects without campaign metrics show only the existing weekly badge.

---

## Task 8: QuickEntry — use `detectActivePeriod`

**Files:**
- Modify: `client/src/components/QuickEntry.jsx`

- [ ] **Step 1: Import `detectActivePeriod`**

Find the import at the top:
```js
import { formatNum } from '../utils/calculations.js';
```
Replace with:
```js
import { formatNum, detectActivePeriod } from '../utils/calculations.js';
```

- [ ] **Step 2: Replace inline period detection**

Find this block inside the `useEffect` (around line 44–51):
```js
      const sorted = [...periods].sort((a, b) => b.start_date.localeCompare(a.start_date));
      const activePeriod = sorted.find(p => {
        const t = today();
        return String(p.start_date).slice(0,10) <= t && String(p.end_date).slice(0,10) >= t;
      }) || sorted[0];
      setPeriod(activePeriod);
```

Replace with:
```js
      const activePeriod = detectActivePeriod(periods);
      setPeriod(activePeriod);
```

- [ ] **Step 3: Verify in browser**

Open the `+` Quick Entry button. Select Full Contact. Should land on the correct active week period (Hafta 1), not the campaign period "May".

---

## Task 9: HistoryTable — use `resolveTarget`

**Files:**
- Modify: `client/src/components/shared/HistoryTable.jsx`

- [ ] **Step 1: Import `resolveTarget`**

Find the top import:
```js
import { weeklyPercent, colorKey, formatNum, COLOR_CLASSES } from '../../utils/calculations.js';
```
Replace with:
```js
import { weeklyPercent, colorKey, formatNum, COLOR_CLASSES, resolveTarget } from '../../utils/calculations.js';
```

- [ ] **Step 2: Replace `getTarget` with `resolveTarget`**

Find the `getTarget` function (around line 26–29):
```js
  const getTarget = (periodId, metricId) => {
    const tgt = allTargets?.find(t => t.period_id === periodId && t.metric_id === metricId);
    return tgt?.weekly_target || 0;
  };
```

Replace with:
```js
  const getTarget = (period, metricId) => {
    const tgt = resolveTarget(allTargets, metricId, period);
    return tgt?.weekly_target || 0;
  };
```

- [ ] **Step 3: Update all `getTarget` call sites**

`getTarget` is called as `getTarget(period.id, m.id)` in several places. Change every occurrence to pass the full `period` object instead of `period.id`:

- `periodScore(period.id)` → update the function signature and internal call:
```js
  const periodScore = (period) => {
    const pcts = metrics.map(m => {
      const actual = getActual(period.id, m.id);
      const target = getTarget(period, m.id);
      return weeklyPercent(actual, target, m.type === 'inverse');
    }).filter(p => p !== null);
    if (pcts.length === 0) return null;
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  };
```

- In the render, find `periodScore(period.id)` and change to `periodScore(period)`.

- Find `getTarget(period.id, m.id)` in the table rows and change to `getTarget(period, m.id)`.

- [ ] **Step 4: Verify in browser**

Open Full Contact project, scroll to History section. Sibling weeks should appear with correct % badges. Campaign metrics should resolve their targets correctly even if stored on the campaign period.

---

## Task 10: RolloverTab — period-object target resolution

**Files:**
- Modify: `client/src/components/Workshop/RolloverTab.jsx`

- [ ] **Step 1: Replace `getTarget` with period-object fallback**

Find the `getTarget` function (around line 69–72):
```js
  const getTarget = (periodId, metricId) => {
    const t = allTargets.find(t => t.period_id === periodId && t.metric_id === metricId);
    return t?.weekly_target || 0;
  };
```

Replace with:
```js
  const getTarget = (period, metricId) => {
    // Prefer period-specific target; fall back to parent campaign target
    const t = allTargets.find(t => t.period_id === period.id && t.metric_id === metricId)
           || (period.parent_id
               ? allTargets.find(t => t.period_id === period.parent_id && t.metric_id === metricId)
               : null);
    return t?.weekly_target || 0;
  };
```

- [ ] **Step 2: Update all `getTarget` call sites in RolloverTab**

Find every `getTarget(p.id, m.id)` and change to `getTarget(p, m.id)`. Also `getTarget(periodId, metricId)` calls in `metricShortfall`, `newTarget`:

```js
  const metricShortfall = (metricId) => {
    if (metrics.find(m => m.id === metricId)?.type === 'inverse') return 0;
    return completedPeriods.reduce((total, p) => {
      const actual = getActual(p, metricId);
      const wt = getTarget(p, metricId);   // <-- pass p not p.id
      return total + Math.max(0, wt - actual);
    }, 0);
  };

  const newTarget = (period, metricId) => {  // <-- accept period object
    const current = getTarget(period, metricId);
    const add = addPerPeriod(metricId);
    return current + add;
  };
```

Then in the render, change `newTarget(p.id, m.id)` → `newTarget(p, m.id)`, `getTarget(p.id, m.id)` → `getTarget(p, m.id)`.

- [ ] **Step 3: Verify in Workshop → Rollover tab**

Select Full Contact. Completed periods should show correct shortfall amounts for campaign metrics (resolved from campaign period target). Redistribution preview should display correct new targets.

---

## Task 11: Build and deploy

- [ ] **Step 1: Build**
```bash
cd "C:/Users/rusta/OneDrive/Рабочий стол/claudee/tracker/client"
npm run build
```
Expected: `✓ built in Xs` with no errors.

- [ ] **Step 2: Deploy**
```bash
scp -r "C:/Users/rusta/OneDrive/Рабочий стол/claudee/tracker/client/dist/." root@46.62.147.30:/home/bekhruz/tracker/client/dist/
ssh root@46.62.147.30 "chmod -R 755 /home/bekhruz/tracker/client/dist/ && echo done"
```

- [ ] **Step 3: Smoke test**

Open `46.62.147.30:8080`. Check:
- [ ] Dashboard shows two badges on Full Contact card
- [ ] Full Contact → arrows step Hafta 1 → Hafta 2 only
- [ ] "May ›" breadcrumb appears; clicking it switches to campaign mode
- [ ] Campaign mode: title = "THIS CAMPAIGN — METRICS", no PeriodComparison
- [ ] "↓ Hafta 1" chip returns to week mode
- [ ] MetricBar for campaign metrics shows `[X% of goal]` badge
- [ ] Workshop → Targets → save a campaign metric → switch weeks → target still appears
- [ ] Workshop → Rollover → shortfall math correct for campaign metrics
- [ ] Quick Entry → Full Contact → lands on Hafta 1, not May
