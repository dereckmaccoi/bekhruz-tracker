# Batch 3 — Smart Mid-Period Redistribution

**Date:** 2026-05-07
**Status:** Approved

---

## Concept
When the current week's pace falls below 70% and at least 3 days have elapsed in the period,
the app proactively offers to redistribute the expected shortfall into upcoming periods —
without waiting for the period to end.

This is like Meta's CBO shifting budget mid-flight based on performance signals.

---

## Trigger condition
```
daysElapsed >= 3
AND pace% < 70 for ANY non-inverse metric
AND there are future sibling periods (nextPeriod exists)
AND user has not already dismissed this offer for this period
```

---

## UI

### In ProjectPage.jsx
An amber banner between the tab bar and the metrics section:

```
⚠ Sotuv is at 42% pace — on track for 58 of 100.
  Expected 42 shortfall by week end.
  [Add to next week] [Dismiss]
```

- "Add to next week" → calls `api.upsertTarget` for each behind metric on the next sibling period,
  adding `ceil(projectedShortfall / remainingPeriods)` to the existing target
- "Dismiss" → stores `dismissed: true` in component state (resets on page navigation)
- Banner only appears once per session per period (not repeatedly)

### Calculation
```
projectedActual   = (actual / daysElapsed) * period.days
projectedShortfall = max(0, weeklyTarget - projectedActual)
addToNextPeriod    = ceil(projectedShortfall / remainingFuturePeriods)
```

---

## State management
- `smartRedistDismissed` state in `ProjectPage` (boolean, resets on period change)
- `showSmartRedist` derived boolean computed from trigger condition

---

## Files to change
| File | Change |
|------|--------|
| `client/src/components/ProjectPage.jsx` | Add trigger condition logic, banner UI, apply/dismiss handlers |
| `client/src/hooks/usePace.js` | Export `projectedActual` per metric (add to result object) |

No database changes beyond existing `upsertTarget` API.
