# Batch 2 — Funnel Conversion Rates & Week-over-Week Trends

**Date:** 2026-05-07
**Status:** Approved

---

## Feature 1: Funnel Conversion Rate

### Concept
Show the ratio between adjacent metrics (by sort_order) in a project to reveal pipeline health.
Example: 100 Leads → 15 Sotuv = **15% conversion rate**

### Where to display
- In `ProjectPage.jsx` metrics section, below the MetricBar list
- A compact row: `Leads → Sotuv · 15% conversion (this week)` shown only when ≥ 2 non-inverse metrics exist
- Also shown on Dashboard card as a small footnote line under the metric grid

### Data model
No DB changes. Conversion rate is computed client-side:
```
rate = (actual_of_metric_N+1 / actual_of_metric_N) * 100
```
- Metrics ordered by `sort_order` ascending
- Skip inverse metrics (churn) in the funnel chain
- Only compute when both actuals are > 0

### Display rules
- Show as: `[Metric A name] → [Metric B name] · X%`
- If rate < last week's rate: show ↓ in red
- If rate > last week's rate: show ↑ in green
- If no previous week data: show rate only, no arrow

---

## Feature 2: Week-over-Week Trend Arrows

### Concept
Each MetricBar shows a small arrow (↑ ↓ →) comparing this week's pace% to last week's final%.

### Calculation
```
thisWeekPct  = pace[m.id].pct          // already computed by usePace
lastWeekPct  = weeklyPercent(lastWeekActual, lastWeekTarget, isInverse)
delta        = thisWeekPct - lastWeekPct
```

- `↑` green: delta > +5
- `→` gray: delta between -5 and +5
- `↓` red: delta < -5

### Where to display
- In `MetricBar.jsx`, to the right of the metric name on the top row
- Small, non-intrusive: 10px arrow glyph with the delta value, e.g. `↑ +12%`

### Data flow
- `ProjectPage.jsx` must identify the previous sibling period (already available in `siblingPeriods`)
- Compute `lastWeekActual` by summing entries filtered to previous period's date range
- Pass to MetricBar as new prop `trend: { pct: number, delta: number } | null`

---

## Files to change
| File | Change |
|------|--------|
| `client/src/components/ProjectPage.jsx` | Compute lastWeekActual + trend per metric; compute funnel rate; pass to MetricBar; render funnel row |
| `client/src/components/shared/MetricBar.jsx` | Accept `trend` prop; render arrow + delta on top row |
| `client/src/components/Dashboard.jsx` | Render funnel rate footnote in metric grid |

No database changes. No API changes.
