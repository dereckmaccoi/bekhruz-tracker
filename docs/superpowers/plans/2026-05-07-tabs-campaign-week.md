# Week / Campaign Tab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit Week/Campaign tab bar to ProjectPage with proportional weekly targets, and redesign Dashboard cards to show campaign progress as the primary element.

**Architecture:** `usePace` gains a `tab` + `numSiblingWeeks` parameter so it can return week-proportional numbers without a second hook call. `ProjectPage` replaces the hidden breadcrumb toggle with a visible tab bar. `Dashboard`'s `ProjectCard` is restructured to lead with a campaign progress bar, week pace below it.

**Tech Stack:** React 18, Vite, Tailwind CSS. No DB changes. No new API endpoints.

---

## File Map

| File | Change |
|------|--------|
| `client/src/hooks/usePace.js` | Add `tab`, `numSiblingWeeks` params; proportional target in week mode |
| `client/src/components/ProjectPage.jsx` | Replace `scope`/breadcrumb with `tab` state + tab bar; pass new params to `usePace`; remove `campaignScopePace` |
| `client/src/components/Dashboard.jsx` | `ProjectCard`: campaign bar → week pace row → metric grid |

`calculations.js`, `MetricBar.jsx`, `HistoryTable.jsx`, `RolloverTab.jsx`, `TargetsTab.jsx` — **no changes**.

---

## Task 1: Update `usePace` — tab-aware proportional targets

**Files:**
- Modify: `client/src/hooks/usePace.js`

- [ ] **Step 1: Open the file and read current signature**

  File: `client/src/hooks/usePace.js` — current signature:
  ```js
  export function usePace(metrics, targets, entries, period, campaignPeriod = null, campaignEntries = null)
  ```

- [ ] **Step 2: Replace the entire file with the tab-aware version**

  Replace `client/src/hooks/usePace.js` with:

  ```js
  import { useMemo } from 'react';
  import {
    pacePercent,
    expectedByToday,
    dailyTarget,
    colorKey,
    statusLabel,
    formatNum,
    resolveTarget,
  } from '../utils/calculations.js';

  /**
   * Computes pace stats for all metrics in a given period.
   *
   * @param metrics          - array of metric objects (with .type)
   * @param targets          - array of target objects (with .metric_id, .weekly_target)
   * @param entries          - entries filtered to the current week/period date range
   * @param period           - the current period (week or standalone)
   * @param campaignPeriod   - optional parent campaign period
   * @param campaignEntries  - optional entries for the whole campaign date range
   * @param tab              - 'week' | 'campaign' (default: 'week')
   * @param numSiblingWeeks  - number of sibling week periods (for proportional target, default: 1)
   */
  export function usePace(
    metrics,
    targets,
    entries,
    period,
    campaignPeriod = null,
    campaignEntries = null,
    tab = 'week',
    numSiblingWeeks = 1,
  ) {
    return useMemo(() => {
      if (!metrics || !targets || !period) return {};

      // Week-scoped entries summed by metric
      const actualMap = {};
      entries?.forEach(e => {
        actualMap[e.metric_id] = (actualMap[e.metric_id] || 0) + Number(e.value);
      });

      // Campaign-scope entries summed by metric (full campaign duration)
      const campaignActualMap = {};
      campaignEntries?.forEach(e => {
        campaignActualMap[e.metric_id] = (campaignActualMap[e.metric_id] || 0) + Number(e.value);
      });

      // Days remaining in the current week period (including today)
      const todayStr      = new Date().toISOString().slice(0, 10);
      const endStr        = String(period.end_date).slice(0, 10);
      const remainingDays = todayStr <= endStr
        ? Math.ceil((new Date(endStr) - new Date(todayStr)) / 86400000) + 1
        : 0;

      const result = {};
      metrics.forEach(m => {
        const isCampaign = m.type === 'campaign';
        const isInverse  = m.type === 'inverse';

        // ── Determine weeklyTarget ──────────────────────────────────────────
        let weeklyTarget;
        if (isCampaign) {
          // Week-specific override takes priority (set manually in TargetsTab)
          const weekOverride = targets.find(
            t => t.period_id === period.id && t.metric_id === m.id
          );
          // Campaign total (stored on the parent campaign period)
          const campaignTotal = resolveTarget(targets, m.id, period)?.weekly_target || 0;

          if (tab === 'week') {
            // Use override if set; otherwise proportional slice of campaign total
            weeklyTarget = weekOverride?.weekly_target
              || (numSiblingWeeks > 0 ? Math.ceil(campaignTotal / numSiblingWeeks) : campaignTotal);
          } else {
            // Campaign tab: show full campaign total
            weeklyTarget = campaignTotal;
          }
        } else {
          const target = resolveTarget(targets, m.id, period);
          weeklyTarget = target?.weekly_target || 0;
        }

        // ── Determine effectivePeriod and actual ────────────────────────────
        // Week tab: campaign metrics use the current week period + week entries
        // Campaign tab: campaign metrics use the campaign period + campaign entries
        const effectivePeriod = (isCampaign && tab === 'campaign' && campaignPeriod)
          ? campaignPeriod
          : period;

        const actual = (isCampaign && tab === 'campaign' && campaignEntries)
          ? (campaignActualMap[m.id] || 0)
          : (actualMap[m.id] || 0);

        // ── Pace calculations ───────────────────────────────────────────────
        const pct      = pacePercent(actual, weeklyTarget, effectivePeriod, isInverse);
        const expected = expectedByToday(weeklyTarget, effectivePeriod);
        const dt       = dailyTarget(weeklyTarget, effectivePeriod);
        const color    = colorKey(pct, isInverse);
        const status   = statusLabel(pct, isInverse);
        const gap      = actual - expected;
        const isAhead  = isInverse ? gap <= 0 : gap >= 0;
        const gapLabel = isAhead
          ? `+${formatNum(Math.abs(gap))} ahead of today's pace (${formatNum(expected)})`
          : `−${formatNum(Math.abs(gap))} behind today's pace (${formatNum(expected)})`;

        // Remaining days in the effective period
        const endEffective       = String(effectivePeriod.end_date).slice(0, 10);
        const remainingEffective = todayStr <= endEffective
          ? Math.ceil((new Date(endEffective) - new Date(todayStr)) / 86400000) + 1
          : 0;

        const shortfall      = weeklyTarget - actual;
        const catchUpPerDay  = !isInverse && shortfall > 0 && remainingEffective > 0
          ? Math.ceil(shortfall / remainingEffective)
          : null;

        // ── Campaign completion badge (always campaign-scoped) ───────────────
        // Shows total campaign progress regardless of which tab is active.
        const campaignTotalForBadge = resolveTarget(targets, m.id, period)?.weekly_target || 0;
        const campaignActualForBadge = campaignActualMap[m.id] || 0;
        const campaignCompletionPct = isCampaign && campaignTotalForBadge
          ? Math.round((campaignActualForBadge / campaignTotalForBadge) * 100)
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
          remainingDays: remainingEffective,
          isInverse,
          isCampaign,
          campaignCompletionPct,
        };
      });

      return result;
    }, [metrics, targets, entries, period, campaignPeriod, campaignEntries, tab, numSiblingWeeks]);
  }
  ```

- [ ] **Step 3: Verify no import errors**

  Run: `cd client && npm run build 2>&1 | head -30`
  Expected: No errors mentioning `usePace`.

---

## Task 2: Update `ProjectPage` — tab bar + single usePace call

**Files:**
- Modify: `client/src/components/ProjectPage.jsx`

- [ ] **Step 1: Replace `scope` state with `tab` state**

  Find:
  ```js
  const [scope, setScope]                   = useState('week'); // 'week' | 'campaign'
  ```
  Replace with:
  ```js
  const [tab, setTab]                       = useState('week'); // 'week' | 'campaign'
  ```

- [ ] **Step 2: Update the reset in the project-change effect**

  Find:
  ```js
    setScope('week');
  ```
  Replace with:
  ```js
    setTab('week');
  ```

- [ ] **Step 3: Add `numSiblingWeeks` computation (after `campaignEntries`)**

  Find:
  ```js
  const pace = usePace(data?.metrics, data?.targets, periodEntries, period, campaignPeriod, campaignEntries);
  ```
  Replace with:
  ```js
  // Count sibling week periods — used for proportional weekly target in week tab.
  // e.g. a 4-week campaign → numSiblingWeeks = 4 → each week's proportional target = campaignTotal / 4
  const siblingWeeks = period?.parent_id
    ? projectPeriods.filter(p => p.parent_id === period.parent_id)
    : [];
  const numSiblingWeeks = siblingWeeks.length || 1;

  const pace = usePace(
    data?.metrics,
    data?.targets,
    periodEntries,
    period,
    campaignPeriod,
    campaignEntries,
    tab,
    numSiblingWeeks,
  );
  ```

- [ ] **Step 4: Remove the `campaignScopePace` call and `activePace` assignment**

  Find and delete these three lines:
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

  Then find every usage of `activePace` in the render and replace with `pace`:
  - `const pcts = metrics.map(m => activePace[m.id]?.pct)` → `pace[m.id]?.pct`
  - `const mostBehind = metrics.filter(m => activePace[m.id]?.pct !== null...` → `pace[m.id]?.pct`
  - `.sort((a, b) => activePace[a.id].pct - activePace[b.id].pct)` → `pace[a.id].pct`
  - `{t('behindAlert', { n: formatNum(Math.abs(activePace[mostBehind.id].gap))` → `pace[mostBehind.id].gap`
  - `<MetricBar key={m.id} metric={m} pace={activePace[m.id]} />` → `pace[m.id]`

- [ ] **Step 5: Replace `siblingPeriods` computation to use `tab` instead of `scope`**

  Find:
  ```js
  const siblingPeriods = scope === 'campaign'
    ? sortedPeriods.filter(p => !p.parent_id)
    : period?.parent_id
      ? sortedPeriods.filter(p => p.parent_id === period.parent_id)
      : sortedPeriods.filter(p => !p.parent_id);
  ```
  Replace with:
  ```js
  const siblingPeriods = tab === 'campaign'
    ? sortedPeriods.filter(p => !p.parent_id)
    : period?.parent_id
      ? sortedPeriods.filter(p => p.parent_id === period.parent_id)
      : sortedPeriods.filter(p => !p.parent_id);
  ```

- [ ] **Step 6: Add `handleTabSwitch` helper just before the return statement**

  Find the line `return (` that begins the JSX return (the one inside the final `export default function ProjectPage()`).
  Insert before it:
  ```js
  // Switch tab and navigate to the appropriate period
  const handleTabSwitch = (newTab) => {
    if (newTab === tab) return;
    if (newTab === 'campaign' && parentCampaign) {
      setPeriod(parentCampaign);
    } else if (newTab === 'week' && tab === 'campaign') {
      // Return to the active week in this campaign (or first week as fallback)
      const today2 = new Date().toISOString().slice(0, 10);
      const activeWeek = projectPeriods.find(p =>
        p.parent_id === period?.id &&
        String(p.start_date).slice(0, 10) <= today2 &&
        String(p.end_date).slice(0, 10) >= today2
      ) || projectPeriods.find(p => p.parent_id === period?.id);
      if (activeWeek) setPeriod(activeWeek);
    }
    setTab(newTab);
  };
  ```

- [ ] **Step 7: Replace the entire header block with the new tab-bar version**

  Find this block (from `{/* Header */}` to the closing `</div>` of the header flex row, just before `{/* Alert */}`):
  ```jsx
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
        <h1 className="text-xl font-semibold text-stone-900">{meta.name}</h1>
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
        {scope === 'campaign' && (() => {
          const today2 = new Date().toISOString().slice(0, 10);
          const activeWeek = projectPeriods.find(p => {
            return p.parent_id === period?.id &&
              String(p.start_date).slice(0, 10) <= today2 &&
              String(p.end_date).slice(0, 10) >= today2;
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
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${projC.tag}`}>
          {avgPct !== null ? `${avgPct}%` : '—'}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-400 border border-stone-200">
          {t('readOnly')}
        </span>
      </div>
  ```

  Replace with:
  ```jsx
      {/* Header */}
      <div className="space-y-0">
        {/* Top row: project name + period nav + pace badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
          <h1 className="text-xl font-semibold text-stone-900">{meta.name}</h1>

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

          <span className={`text-xs px-2 py-0.5 rounded font-medium ${projC.tag}`}>
            {avgPct !== null ? `${avgPct}%` : '—'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-400 border border-stone-200">
            {t('readOnly')}
          </span>
        </div>

        {/* Tab bar — only shown when a parent campaign exists */}
        {parentCampaign && (
          <div className="flex gap-0 border-b border-stone-200 mt-3">
            <button
              onClick={() => handleTabSwitch('week')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'week'
                  ? 'border-stone-800 text-stone-900'
                  : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => handleTabSwitch('campaign')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === 'campaign'
                  ? 'border-stone-800 text-stone-900'
                  : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}
            >
              {parentCampaign.name}
            </button>
          </div>
        )}
      </div>
  ```

- [ ] **Step 8: Update the metrics section heading to use `tab` instead of `scope`**

  Find:
  ```jsx
          {scope === 'campaign' ? 'THIS CAMPAIGN — METRICS' : t('thisWeekMetrics')}
  ```
  Replace with:
  ```jsx
          {tab === 'campaign' ? 'THIS CAMPAIGN — METRICS' : t('thisWeekMetrics')}
  ```

- [ ] **Step 9: Update the PeriodComparison guard to use `tab`**

  Find:
  ```jsx
      {/* Period Comparison — week mode only */}
      {scope === 'week' && hasTargets && sortedPeriods.length >= 2 && (
  ```
  Replace with:
  ```jsx
      {/* Period Comparison — week mode only */}
      {tab === 'week' && hasTargets && sortedPeriods.length >= 2 && (
  ```

- [ ] **Step 10: Update the DayChart period prop to use `tab`**

  Find:
  ```jsx
              period={scope === 'campaign' ? (campaignPeriod ?? period) : period}
  ```
  Replace with:
  ```jsx
              period={tab === 'campaign' ? (campaignPeriod ?? period) : period}
  ```

- [ ] **Step 11: Update the targets table scope references to use `tab`**

  Find:
  ```js
              const dtPeriod = (m.type === 'campaign' || scope === 'campaign')
  ```
  Replace with:
  ```js
              const dtPeriod = (m.type === 'campaign' || tab === 'campaign')
  ```

- [ ] **Step 12: Update the HistoryTable periods prop to use `tab`**

  Find:
  ```jsx
          periods={scope === 'week' ? siblingPeriods : sortedPeriods.filter(p => !p.parent_id)}
  ```
  Replace with:
  ```jsx
          periods={tab === 'week' ? siblingPeriods : sortedPeriods.filter(p => !p.parent_id)}
  ```

- [ ] **Step 13: Build and verify no errors**

  Run: `cd client && npm run build 2>&1 | head -40`
  Expected: Build succeeds with no errors.

---

## Task 3: Update `Dashboard` — campaign-first card layout

**Files:**
- Modify: `client/src/components/Dashboard.jsx`

- [ ] **Step 1: Add campaign date helpers inside `ProjectCard`, after `campaignPeriod` is defined**

  In `ProjectCard`, find the line:
  ```js
  const cStart = campaignPeriod ? String(campaignPeriod.start_date).slice(0, 10) : '';
  const cEnd   = campaignPeriod ? String(campaignPeriod.end_date).slice(0, 10) : '';
  ```
  After those two lines, add:
  ```js
  const todayStr        = new Date().toISOString().slice(0, 10);
  const campaignDays    = campaignPeriod
    ? Math.round((new Date(cEnd) - new Date(cStart)) / 86400000) + 1
    : 0;
  const campaignElapsed = campaignPeriod
    ? Math.min(campaignDays, Math.max(1, Math.round((new Date(Math.min(new Date(todayStr), new Date(cEnd))) - new Date(cStart)) / 86400000) + 1))
    : 0;
  ```

- [ ] **Step 2: Replace the card JSX — top row, progress bar, and add campaign bar + week row**

  Find the entire `return (` block inside `ProjectCard` (from `<div className="bg-white rounded-2xl` to its final closing `</div>`):
  ```jsx
    return (
      <div
        className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5"
        onClick={() => navigate(`/project/${project.id}`)}
      >
        {/* Color strip */}
        <div className="h-1" style={{ backgroundColor: project.color }} />

        <div className="p-5">
          {/* Top row: name + badge */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <span className="font-bold text-stone-900 text-base leading-tight">{project.name}</span>
              {period && (
                <p className="text-xs text-stone-400 mt-0.5">
                  {period.name} &middot; {fmtDate(period.start_date)}–{fmtDate(period.end_date)}
                </p>
              )}
            </div>
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
          </div>

          {/* Progress bar */}
          {hasTargets && (
            <div className="mt-4 mb-4">
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${c.bar}`}
                  style={{ width: `${Math.min(100, avgPct || 0)}%` }}
                />
              </div>
            </div>
          )}

          {/* Metric grid */}
          {hasTargets ? (
            <div className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.min(metrics.length, 3)}, 1fr)` }}
            >
              {metrics.slice(0, 3).map(m => {
                const actual = actualMap[m.id] || 0;
                const tgt = targetMap[m.id];
                const mPct = tgt
                  ? pacePercent(actual, tgt.weekly_target, period, m.type === 'inverse')
                  : null;
                const mColor = colorKey(mPct, false);
                const mC = COLOR_CLASSES[mColor] || COLOR_CLASSES.gray;
                const pDays = period.days || Math.round((new Date(String(period.end_date).slice(0,10)) - new Date(String(period.start_date).slice(0,10))) / 86400000) + 1;
                const dt = tgt ? tgt.weekly_target / pDays : 0;
                const metricEntries = entries.filter(e => e.metric_id === m.id);
                return (
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
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-stone-400 mt-3">{t('noTargetsSet')}</p>
          )}
        </div>
      </div>
    );
  ```

  Replace with:
  ```jsx
    return (
      <div
        className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5"
        onClick={() => navigate(`/project/${project.id}`)}
      >
        {/* Color strip */}
        <div className="h-1" style={{ backgroundColor: project.color }} />

        <div className="p-5 space-y-3">
          {/* Top row: project name only */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-stone-900 text-base leading-tight">{project.name}</span>
            {hasTargets && avgPct !== null && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${c.tag}`}>
                {avgPct}% week
              </span>
            )}
          </div>

          {/* Campaign progress bar — primary element */}
          {hasTargets && campaignPeriod && avgCampaignPct !== null && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-stone-500 font-medium">
                  {campaignPeriod.name} · {campaignElapsed} of {campaignDays} days
                </span>
                <span className={`text-[11px] font-semibold ${
                  avgCampaignPct >= 90 ? 'text-[#085041]' :
                  avgCampaignPct >= 70 ? 'text-[#633806]' : 'text-[#791F1F]'
                }`}>
                  {avgCampaignPct}%
                </span>
              </div>
              <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${cC?.bar || 'bg-stone-300'}`}
                  style={{ width: `${Math.min(100, avgCampaignPct)}%` }}
                />
              </div>
            </div>
          )}

          {/* Week pace row — secondary */}
          {hasTargets && period && (
            <div className="flex items-center justify-between text-[11px] text-stone-400">
              <span>{period.name} · {fmtDate(period.start_date)}–{fmtDate(period.end_date)}</span>
              {avgPct !== null && (
                <span className={`font-medium ${
                  avgPct >= 90 ? 'text-[#085041]' :
                  avgPct >= 70 ? 'text-[#633806]' : 'text-[#791F1F]'
                }`}>
                  {avgPct}% pace
                </span>
              )}
            </div>
          )}

          {/* Week progress bar (when no campaign bar) */}
          {hasTargets && !campaignPeriod && (
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${c.bar}`}
                style={{ width: `${Math.min(100, avgPct || 0)}%` }}
              />
            </div>
          )}

          {/* Metric grid */}
          {hasTargets ? (
            <div className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.min(metrics.length, 3)}, 1fr)` }}
            >
              {metrics.slice(0, 3).map(m => {
                const actual = actualMap[m.id] || 0;
                const tgt = targetMap[m.id];
                const mPct = tgt
                  ? pacePercent(actual, tgt.weekly_target, period, m.type === 'inverse')
                  : null;
                const mColor = colorKey(mPct, false);
                const mC = COLOR_CLASSES[mColor] || COLOR_CLASSES.gray;
                const pDays = period.days || Math.round((new Date(String(period.end_date).slice(0,10)) - new Date(String(period.start_date).slice(0,10))) / 86400000) + 1;
                const dt = tgt ? tgt.weekly_target / pDays : 0;
                const metricEntries = entries.filter(e => e.metric_id === m.id);
                return (
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
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-stone-400">{t('noTargetsSet')}</p>
          )}
        </div>
      </div>
    );
  ```

- [ ] **Step 2: Build and verify no errors**

  Run: `cd client && npm run build 2>&1 | head -40`
  Expected: Build succeeds with no errors.

---

## Task 4: Build and deploy

**Files:** None modified — just build + transfer.

- [ ] **Step 1: Full production build**

  Run from `tracker/`:
  ```bash
  cd client && npm run build
  ```
  Expected: `dist/` folder updated, `✓ built in Xs`.

- [ ] **Step 2: Copy dist to server**

  Run from `tracker/`:
  ```bash
  scp -r client/dist/* root@46.62.147.30:/var/www/tracker/
  ```
  Expected: Files transfer without errors.

- [ ] **Step 3: Fix permissions**

  Run:
  ```bash
  ssh root@46.62.147.30 "chmod -R 755 /var/www/tracker/"
  ```
  Expected: No errors.

- [ ] **Step 4: Smoke-test in browser**

  Open `http://46.62.147.30:8080` and verify:
  1. Dashboard — each project card that has a campaign shows the campaign progress bar (not just a small badge)
  2. Open any project → "This Week" / "Campaign" tab bar appears below the header (only when a parent campaign exists)
  3. In **This Week** tab: Sotuv shows e.g. `61 / 100` (proportional), pace is 7-day scoped, `[X% of goal]` badge still shows campaign total completion
  4. Switch to **Campaign** tab: Sotuv shows `61 / 400`, pace spans full campaign duration
  5. Period ← → navigation works in both tabs
  6. Switch back to This Week → automatically lands on active week

---

## Self-Review

**Spec coverage:**
- ✅ Proportional weekly target `campaignTotal ÷ numSiblingWeeks` — Task 1 (`usePace`)
- ✅ Week-specific override takes priority — Task 1 (`usePace`, `weekOverride` check)
- ✅ `[X% of goal]` badge shows campaign total in both tabs — Task 1 (`campaignCompletionPct` always uses `campaignActualMap`)
- ✅ Explicit tab bar below header row — Task 2, Step 7
- ✅ Tab resets on project change — Task 2, Step 2
- ✅ Auto-navigate to active week when switching to Week tab — Task 2, `handleTabSwitch`
- ✅ Dashboard campaign bar as primary element — Task 3
- ✅ Week pace as secondary row — Task 3
- ✅ No DB changes — confirmed (no API calls added)

**Placeholder scan:** No TBD, no TODO in plan steps.

**Type consistency:** `tab: 'week' | 'campaign'` used consistently across all tasks. `numSiblingWeeks` passed from `ProjectPage` → `usePace`. `avgCampaignPct` and `cC` already computed in `ProjectCard` and reused in campaign bar.
