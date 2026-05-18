# Batch 3 — Smart Mid-Period Redistribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When pace falls below 70% with ≥ 3 days elapsed, show a proactive amber banner offering to add the projected shortfall to the next sibling period's target.

**Architecture:** Add `projectedActual` to `usePace` result. In `ProjectPage`, compute trigger condition, manage dismiss state, render amber banner with Apply/Dismiss actions. "Apply" calls `api.upsertTarget` on the next sibling period — no backend changes needed.

**Tech Stack:** React 18, Tailwind CSS. Project root: `C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker`

---

## File Map

| File | Change |
|------|--------|
| `client/src/hooks/usePace.js` | Export `projectedActual` per metric in result object |
| `client/src/components/ProjectPage.jsx` | Trigger logic, dismiss state, banner UI, apply handler |

---

### Task 1: Add `projectedActual` to usePace

**Files:**
- Modify: `client/src/hooks/usePace.js`

**Background:** `usePace` already computes `actual`, `weeklyTarget`, and has the period. We need to add `projectedActual = (actual / daysElapsed) * periodDays` so ProjectPage can use it without re-computing.

- [ ] **Step 1: Locate result object in usePace**

In `client/src/hooks/usePace.js`, inside the `metrics.forEach(m => { ... })` loop, find the `result[m.id] = { ... }` assignment (around line 127).

- [ ] **Step 2: Compute daysElapsed for the effective period**

In the hook, `todayStr` is already defined. Add after the `remainingEffective` computation (around line 112):
```js
const startEffective  = String(effectivePeriod.start_date).slice(0, 10);
const endEffective2   = String(effectivePeriod.end_date).slice(0, 10);
const totalPeriodDays = Math.round(
  (new Date(endEffective2) - new Date(startEffective)) / 86400000
) + 1;
const daysElapsed = todayStr >= startEffective
  ? Math.min(
      totalPeriodDays,
      Math.floor((new Date(Math.min(new Date(todayStr), new Date(endEffective2))) - new Date(startEffective)) / 86400000) + 1
    )
  : 0;
const projectedActual = daysElapsed > 0
  ? Math.round((actual / daysElapsed) * totalPeriodDays)
  : 0;
```

Note: `endEffective` is already defined on line 109 (same variable). Use `endEffective2` to avoid collision, or rename — whichever avoids a lint error. If `endEffective` is already in scope, just reuse it.

- [ ] **Step 3: Add projectedActual to result object**

In `result[m.id] = { ... }`, add `projectedActual` as a new field:
```js
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
  remainingDays: remainingEffective,
  isInverse,
  isCampaign,
  campaignCompletionPct,
  projectedActual,  // ← new
};
```

- [ ] **Step 4: Verify no errors**

Run `cd client && npm run dev`. Navigate to a project page. Confirm no console errors. The `projectedActual` value won't be visible yet — that's fine.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/usePace.js
git commit -m "feat: add projectedActual to usePace result for smart redistribution"
```

---

### Task 2: Smart Redistribution Banner in ProjectPage

**Files:**
- Modify: `client/src/components/ProjectPage.jsx`

**Background:** The banner appears below the tab bar, above the metrics section. It shows a message with "Add to next week" and "Dismiss" buttons. Trigger: daysElapsed ≥ 3 AND any non-inverse metric has pace < 70% AND a future sibling period exists AND user hasn't dismissed it this session.

- [ ] **Step 1: Add dismiss state**

In `ProjectPage`, find the existing state declarations (around line 160). Add:
```js
const [smartRedistDismissed, setSmartRedistDismissed] = useState(false);
```

Also reset it when the period changes — add to the existing `useEffect` that resets state on period change, OR add:
```js
useEffect(() => {
  setSmartRedistDismissed(false);
}, [period?.id]);
```

- [ ] **Step 2: Compute trigger condition**

After `pace` is computed (after `const pace = usePace(...)`) and after `nextPeriod` is defined, add:

```js
// Smart redistribution trigger
const todayForRedist = new Date().toISOString().slice(0, 10);
const pStartRedist = period ? String(period.start_date).slice(0, 10) : '';
const pEndRedist   = period ? String(period.end_date).slice(0, 10) : '';
const daysElapsedRedist = period && pStartRedist <= todayForRedist
  ? Math.min(
      Math.round((new Date(pEndRedist) - new Date(pStartRedist)) / 86400000) + 1,
      Math.floor((new Date(Math.min(new Date(todayForRedist), new Date(pEndRedist))) - new Date(pStartRedist)) / 86400000) + 1
    )
  : 0;

const behindMetrics = metrics
  ? metrics.filter(m => !m.type?.includes('inverse') && (pace[m.id]?.pct ?? 100) < 70)
  : [];

const showSmartRedist =
  !smartRedistDismissed &&
  daysElapsedRedist >= 3 &&
  behindMetrics.length > 0 &&
  !!nextPeriod &&
  tab === 'week';
```

- [ ] **Step 3: Compute shortfall message for banner**

After the trigger condition block, add:
```js
// For banner message: use the most-behind metric
const worstMetric = behindMetrics.sort((a, b) => (pace[a.id]?.pct ?? 100) - (pace[b.id]?.pct ?? 100))[0];
const worstPace   = worstMetric ? (pace[worstMetric.id] ?? {}) : {};
const projActual  = worstPace.projectedActual ?? 0;
const projShortfall = worstPace.weeklyTarget
  ? Math.max(0, worstPace.weeklyTarget - projActual)
  : 0;
```

- [ ] **Step 4: Add Apply handler**

Add the `handleSmartRedist` function just before the `return (...)` in `ProjectPage`:
```js
const handleSmartRedist = async () => {
  if (!nextPeriod || !metrics || !targets) return;
  try {
    const remainingFuturePeriods = siblingPeriods.filter(p =>
      String(p.start_date).slice(0, 10) > (todayForRedist)
    ).length || 1;

    await Promise.all(
      behindMetrics.map(m => {
        const paceData  = pace[m.id] ?? {};
        const projected = paceData.projectedActual ?? 0;
        const shortfall = Math.max(0, (paceData.weeklyTarget ?? 0) - projected);
        const addAmount = Math.ceil(shortfall / remainingFuturePeriods);
        if (addAmount <= 0) return Promise.resolve();

        // Current target on nextPeriod (from targets array, fall back to 0)
        const nextTgt = targets.find(t => t.period_id === nextPeriod.id && t.metric_id === m.id);
        const currentNext = nextTgt?.weekly_target || (pace[m.id]?.weeklyTarget || 0);
        return api.upsertTarget({
          metric_id: m.id,
          period_id: nextPeriod.id,
          weekly_target: currentNext + addAmount,
        });
      })
    );
    setSmartRedistDismissed(true);
    // Reload data so new targets are reflected
    if (period) {
      const d = await api.getProject(id, period.id);
      setData(d);
    }
  } catch (e) {
    // Silent fail — user can retry
    console.error('Smart redistribution failed:', e);
  }
};
```

- [ ] **Step 5: Render the banner**

In the JSX return, find where the alert banner is rendered (around line 409):
```jsx
{/* Alert — uses the behindAlert translation key properly */}
{isBehind && mostBehind && (
  <div className="bg-[#FCEBEB] border ...">
    ...
  </div>
)}
```

**Before** this alert (or after the tab bar section), add the smart redistribution banner:
```jsx
{/* Smart redistribution banner */}
{showSmartRedist && worstMetric && (
  <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-amber-800">
        ⚠ {worstMetric.name} is at {worstPace.pct}% pace — on track for {formatNum(projActual)} of {formatNum(worstPace.weeklyTarget)}.
      </p>
      {projShortfall > 0 && (
        <p className="text-xs text-amber-700 mt-0.5">
          Expected ~{formatNum(projShortfall)} shortfall by week end.
          Adding to <strong>{nextPeriod.name}</strong>.
        </p>
      )}
    </div>
    <div className="flex gap-2 shrink-0">
      <button
        onClick={handleSmartRedist}
        className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium transition-colors"
      >
        Add to next week
      </button>
      <button
        onClick={() => setSmartRedistDismissed(true)}
        className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-md hover:bg-amber-100 transition-colors"
      >
        Dismiss
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify in browser**

Navigate to a project page where a metric is below 70% pace and at least 3 days have elapsed in the period, and a future sibling week exists. Confirm:
- The amber banner appears below the tab bar
- "Dismiss" hides the banner (until next period navigation)
- "Add to next week" saves updated targets and hides the banner
- If the trigger conditions aren't met, no banner appears

- [ ] **Step 7: Commit**

```bash
git add client/src/components/ProjectPage.jsx
git commit -m "feat: smart mid-period redistribution banner with Add/Dismiss actions"
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
