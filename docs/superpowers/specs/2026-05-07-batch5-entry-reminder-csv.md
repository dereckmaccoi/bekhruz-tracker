# Batch 5 — Daily Entry Reminder + CSV Export

**Date:** 2026-05-07
**Status:** Approved

---

## Feature 1: Daily Entry Reminder

### Concept
If no entries have been logged today for the active project, show a visual indicator on the
Quick Entry `+` button and a subtle banner on the Dashboard.

### Detection
In `QuickEntry.jsx`, after loading period data:
```js
const todayStr = new Date().toISOString().slice(0, 10);
const hasTodayEntry = entries.some(e => String(e.date).slice(0, 10) === todayStr);
```

### UI changes

**Quick Entry button** (`QuickEntry.jsx`):
- When `!hasTodayEntry` and it's past 12:00 local time: show a small red dot badge on the `+` button
- Badge: `absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#E24B4A]`
- Check time: `new Date().getHours() >= 12`

**Dashboard** (`Dashboard.jsx`):
- Below the summary pills, if ANY project has no today entry past noon:
  show a subtle amber nudge bar: `"⏰ Don't forget to log today's numbers"`
- This uses the entries already fetched per project (no extra API call)

### State
- `hasAnyTodayEntry` computed per project in Dashboard from existing `allEntries` data
- No new API calls needed — entries already fetched on Dashboard mount

---

## Feature 2: CSV Export

### Concept
One-click download of all historical data as a CSV file from the HistoryTable.

### Format
```csv
Period,Start,End,Metric,Target,Actual,Pct
Hafta 1,2026-05-01,2026-05-07,Sotuv,100,61,61%
Hafta 1,2026-05-01,2026-05-07,Leads,1000,420,42%
...
```

### Implementation
In `HistoryTable.jsx`, add a small "Export CSV" button in the top-right of the table header row.

```js
function exportCSV(metrics, periods, allEntries, allTargets) {
  const rows = [['Period', 'Start', 'End', 'Metric', 'Target', 'Actual', 'Pct']];
  periods.forEach(p => {
    metrics.forEach(m => {
      const actual = getActual(p, m.id);  // date-range filter
      const target = getTarget(p, m.id);
      const pct = target > 0 ? Math.round((actual / target) * 100) : '';
      rows.push([p.name, p.start_date, p.end_date, m.name, target, actual, pct ? pct + '%' : '']);
    });
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `tracker-export-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
```

No API calls. No backend changes. Pure client-side Blob download.

---

## Files to change
| File | Change |
|------|--------|
| `client/src/components/QuickEntry.jsx` | Red dot badge when no entry today after noon |
| `client/src/components/Dashboard.jsx` | Amber nudge bar when any project missing today entry |
| `client/src/components/shared/HistoryTable.jsx` | Export CSV button + exportCSV function |
