# Week / Campaign Tab Redesign — Design Spec

**Date:** 2026-05-07  
**Status:** Approved

---

## Problem

After the campaign logic implementation, two UX gaps remain:

1. **ProjectPage shows campaign-scoped numbers even in week mode.** A metric with a campaign target of 400 shows `61 / 400` and `25 days left` regardless of which week the user is on. There is no clear way to view week-level progress.

2. **The scope toggle is hidden.** The breadcrumb-based toggle ("May ›" text link) is too subtle — users cannot find the weekly view.

3. **Dashboard cards bury campaign progress.** The campaign completion percentage is a small secondary badge; week pace is the primary number, making it hard to see how the campaign is tracking overall.

---

## Decisions

### 1. Proportional weekly target formula

**Chosen: Option A — even distribution**

`weeklyTarget = campaignTotal ÷ numberOfSiblingWeeks`

- `campaignTotal` = `weekly_target` stored in the targets table for the campaign period
- `numberOfSiblingWeeks` = count of periods that share the same `parent_id`
- Computed at render time — no database changes

Example: campaign total 400, 4 weeks → 100/week. In Hafta 1, Sotuv shows `61 / 100` with 7-day pace.

The `[X% of goal]` badge on MetricBar still shows total campaign completion (e.g. `15% of goal`) regardless of which tab is active, giving the user overall campaign context while the main numbers are week-scoped.

### 2. Tab design on ProjectPage

**Chosen: Explicit tab bar below the header row**

Two buttons: **This Week** and **Campaign**, rendered directly below the project name / period navigation row. Replaces the hidden breadcrumb toggle entirely.

- Default tab: **This Week**
- Resets to This Week on project change
- In **This Week** tab: campaign metrics use proportional target (`campaignTotal / numWeeks`); actual = entries within the current week period only
- In **Campaign** tab: campaign metrics use full `campaignTotal`; actual = all entries within the campaign period (existing behaviour)
- Both tabs share the same period header (showing the current week name + campaign name); the tab bar determines what the numbers mean

### 3. Dashboard card redesign

**Chosen: Approach B — campaign-first cards**

Card layout (top to bottom):

1. **Campaign progress bar** (full width, primary element)  
   Label: `May · 15 of 31 days · 15%`  
   Filled bar showing `avgCampaignPct` progress

2. **Week pace row** (compact, secondary)  
   `Hafta 1 · 68% week`  
   Uses existing `avgWeekPct`

3. **Metric grid** (unchanged — individual metric rows)

4. **Summary bar** (unchanged, but gains amber pill when behind)  
   Amber pill: `N behind campaign` (already computed as `campaignBehindCount`)

---

## Architecture

### Files to change

| File | Change |
|------|--------|
| `client/src/utils/calculations.js` | Add `weeklyProportionalTarget(campaignTotal, numWeeks)` utility |
| `client/src/hooks/usePace.js` | Accept `numSiblingWeeks` param; use proportional target + week entries in week mode |
| `client/src/components/ProjectPage.jsx` | Replace `scope`/breadcrumb with explicit tab bar; pass `numSiblingWeeks` to `usePace` |
| `client/src/components/Dashboard.jsx` | Campaign-first card layout: campaign bar → week pace row |

No database changes. No new API endpoints. No changes to `MetricBar`, `HistoryTable`, `RolloverTab`, or `TargetsTab`.

### Data flow in week tab

```
siblingPeriods = periods.filter(p => p.parent_id === activePeriod.parent_id)
numWeeks = siblingPeriods.length  // e.g. 4

// Per campaign metric in usePace:
proportionalTarget = campaignTotal / numWeeks   // e.g. 400/4 = 100
actual = entries filtered to activePeriod.id only (week entries)
pace = proportionalTarget, daysInPeriod = activePeriod days (7)
```

### Data flow in campaign tab

Unchanged from current implementation. `usePace` uses `campaignPeriod` + `campaignEntries` for campaign metrics.

---

## Implementation Tasks

1. **`calculations.js`** — add `weeklyProportionalTarget` export
2. **`usePace.js`** — add `numSiblingWeeks` param; branch on `tab === 'week'` to use proportional target + period-scoped entries
3. **`ProjectPage.jsx`** — replace `scope` state + breadcrumb with `tab` state + explicit tab bar UI; compute `numSiblingWeeks`; pass `tab` + `numSiblingWeeks` to `usePace`
4. **`Dashboard.jsx`** — restructure `ProjectCard` render: campaign bar first, week pace row second
5. **Build and deploy** — `npm run build` → `scp` → `chmod 755`

---

## Non-Goals

- No URL routing changes
- No database schema changes
- No changes to target-setting logic (TargetsTab, RolloverTab)
- No changes to HistoryTable or PeriodComparison
