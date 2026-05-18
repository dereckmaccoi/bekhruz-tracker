# Campaign Logic Redesign

**Date:** 2026-05-07  
**Status:** Approved  
**Scope:** Frontend only — no schema changes required

---

## Problem

Five interconnected logic bugs affect campaign-type metrics throughout the app:

1. **Period navigation** steps through campaigns and weeks mixed — arrows jump from "Hafta 1" to parent "May" campaign
2. **Campaign targets stored per-week** — Workshop saves targets on whichever week was selected, so switching weeks loses the target
3. **Dashboard ignores campaign scope** — pace % on cards uses week dates even for campaign metrics
4. **PeriodComparison** compares week actuals against campaign totals — wrong denominator
5. **QuickEntry** has independent period detection that can pick a campaign instead of a week

---

## Approach: Client-side fixes + smart target resolution fallback

No schema changes. Fix all logic in the frontend. Campaign targets saved against the campaign `period_id` in Workshop; everywhere else falls back to the campaign period's target when no week-specific target exists. All existing hooks (`usePace`, `campaignPeriod`, `campaignEntries`) already carry the data needed — this wires it up correctly.

---

## Section 1 — Target Resolution

**Resolution order** (applied everywhere targets are looked up):
1. Target with `period_id === week.id` AND `metric_id === m.id` → use it (explicit week override)
2. No week target → target with `period_id === week.parent_id` AND `metric_id === m.id` → use it (campaign default)
3. Nothing → no target

**Utility function** added to `calculations.js`:
```js
export function resolveTarget(targets, metricId, period) {
  return targets.find(t => t.period_id === period.id && t.metric_id === metricId)
      || (period.parent_id
          ? targets.find(t => t.period_id === period.parent_id && t.metric_id === metricId)
          : null);
}
```

Applied in: `usePace`, `PeriodComparison.getTarget`, `HistoryTable`, `Dashboard.ProjectCard`, `QuickEntry`.

**Workshop TargetsTab change:** when saving a target for a campaign-type metric, save it with the **campaign period's** `period_id` (the parent), not the currently selected week. Week-specific overrides remain possible by explicitly saving a week-level target on top.

---

## Section 2 — Period Navigation & Breadcrumb

**Header structure:**

Week mode:
```
May  ›  ← Hafta 1 · 01/05–07/05 →   [68%]  [read only]
```

Campaign mode:
```
← May · 01/05–31/05 →   [overall%]  [read only]
        ↓ Hafta 1
```

**Navigation rules:**

| Scope | Arrow behaviour | Breadcrumb |
|---|---|---|
| Week | Siblings only: `periods.filter(p => p.parent_id === current.parent_id)` | Campaign name, clickable → campaign mode |
| Campaign | Top-level periods only: `periods.filter(p => !p.parent_id)` | Hidden |
| Standalone (no parent) | All standalone periods | Hidden |

**"↓ Hafta 1" chip** (campaign mode only): shows the active week name; clicking it switches back to week mode on that week.

**State:**
```js
const [scope, setScope] = useState('week'); // 'week' | 'campaign'
// resets to 'week' on project change
```

---

## Section 3 — ProjectPage Scope Toggle

**Week mode (default):**
- Section title: "THIS WEEK — METRICS"
- `usePace` uses week period + campaign fallback for campaign-type metrics (existing behaviour, now correct)
- MetricBar: weekly pace bar + campaign % badge for campaign metrics
- DayChart: current week date range
- PeriodComparison: sibling weeks only
- Targets table: shows weekly target (campaign total for campaign metrics) + daily equiv over week days

**Campaign mode:**
- Section title: "THIS CAMPAIGN — METRICS"
- `usePace` called with campaign period as primary period, campaign entries for all metrics
- MetricBar: campaign pace only — no weekly badge
- DayChart: full campaign date range
- PeriodComparison: hidden
- Targets table: campaign total + daily equiv over campaign days

**Scope is view state only** — does not affect URL. Refreshing resets to week mode.

---

## Section 4 — MetricBar: Weekly Pace + Campaign Badge

**Week mode, campaign metric:**
```
Sotuv                              61 / 400  [15% of goal]
[████░░░░░░░░░░░░░░░░░░] 68% pace  −29 behind today's pace (90)
Need 14/day · 25 days left
```

- `[15% of goal]` = `campaignActual / campaignTotal` expressed as % of campaign elapsed pace
- Badge color: same `colorKey` thresholds, applied against campaign-elapsed expected %
- Non-campaign metrics (daily, weekly, inverse): no badge — layout unchanged
- Campaign mode: badge hidden; main bar shows campaign pace directly

**`usePace` additions:** expose `campaignPct` — pace % computed against campaign period for campaign-type metrics. Already has `actual` (campaign-scoped) and `weeklyTarget` (campaign total); only needs campaign elapsed days to compute expected.

---

## Section 5 — Dashboard Cards: Two Badges

**Card header:**
```
Full Contact          [68% week]  [15% camp.]
Hafta 1 · 01/05–07/05
```

- Badge 1 (existing): average weekly pace % — all metrics
- Badge 2 (new): average campaign-to-date % — campaign-type metrics only; hidden if project has no campaign metrics or no parent campaign
- Badge 2 color: same `colorKey` thresholds

**Summary bar additions:**
- "N behind campaign" counter: projects where campaign badge < 70% even if weekly badge ≥ 70%

**Dashboard data loading:** already loads periods per project. Needs to additionally resolve `campaignPeriod` (parent of active week) and load campaign-scoped entries for campaign % calculation. One extra period lookup per card — same pattern as `ProjectPage`.

---

## Files Changed

| File | Change |
|---|---|
| `utils/calculations.js` | Add `resolveTarget()` |
| `hooks/usePace.js` | Use `resolveTarget`, expose `campaignPct` |
| `components/ProjectPage.jsx` | Scope state, breadcrumb, sibling nav, campaign mode rendering |
| `components/shared/MetricBar.jsx` | Campaign % badge |
| `components/Dashboard.jsx` | Campaign period loading, two badges, summary bar |
| `components/Workshop/TargetsTab.jsx` | Save campaign targets on campaign `period_id` |
| `components/QuickEntry.jsx` | Use `detectActivePeriod` for consistent period resolution |
| `components/shared/HistoryTable.jsx` | Use `resolveTarget` |
| `components/Workshop/RolloverTab.jsx` | Handle campaign metrics in rollover logic |

---

## Out of Scope

- New database columns or API changes
- Cross-project analytics
- Mobile-specific layout changes
