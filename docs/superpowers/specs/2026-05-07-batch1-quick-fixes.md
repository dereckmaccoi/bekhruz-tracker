# Batch 1 — Quick Fixes & Polish

**Date:** 2026-05-07
**Status:** Approved

---

## Changes

### 1. Fix HistoryTable date-range bug
`client/src/components/shared/HistoryTable.jsx` line 22:
- Current: `allEntries?.filter(e => e.period_id === periodId && e.metric_id === metricId)`
- Fix: filter by date range (start_date ≤ e.date ≤ end_date), same as every other component

### 2. Remove "Read Only" badge
`client/src/components/ProjectPage.jsx`:
- Delete the `<span>` element that renders the `{t('readOnly')}` badge
- It conveys no useful information and confuses users

### 3. DayChart "today" marker
`client/src/components/shared/DayChart.jsx`:
- Identify today's bar by comparing the bar's date to `new Date().toISOString().slice(0,10)`
- Render today's bar with a distinct color or a small dot/label above it
- Future bars remain dimmed

### 4. "At this rate" projection on Dashboard campaign bar
`client/src/components/Dashboard.jsx` inside `ProjectCard`:
- Formula: `projectedFinal = Math.round((campaignActual / campaignElapsed) * campaignDays)`
- Display: append to the campaign bar label — e.g. `"May · 7 of 31 days · on track for 270"`
- Only show when `campaignElapsed >= 3` (avoid noise in first 2 days)
- Color the projection text green if `projectedFinal >= campaignTarget`, red otherwise

### 5. Per-metric catch-up lines on Dashboard cards
`client/src/components/Dashboard.jsx` inside the metric grid tiles:
- Each metric tile already shows `actual` and `weekly_target`
- Add one line below: `"Need X/day"` using `Math.ceil((weeklyTarget - actual) / daysLeft)`
- Only show when behind (actual < expected) and daysLeft > 0
- Use amber text (`text-amber-600`) matching ProjectPage style

---

## Files to change
| File | Change |
|------|--------|
| `client/src/components/shared/HistoryTable.jsx` | Date-range filter in `getActual` |
| `client/src/components/ProjectPage.jsx` | Remove Read Only badge |
| `client/src/components/shared/DayChart.jsx` | Today marker on current bar |
| `client/src/components/Dashboard.jsx` | "At this rate" projection + catch-up lines |

No database changes. No API changes.
