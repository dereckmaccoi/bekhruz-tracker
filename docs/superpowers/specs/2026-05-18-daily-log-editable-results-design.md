# Daily Log — Editable Actual Results Design

## Goal

Allow the user to manually override the lead count for any day in the Daily Log, so that after verifying factual lead numbers they can correct the Meta-synced value. The corrected value replaces the displayed number and propagates to totals and CPL.

## Scope

- **Editable metric:** Total Leads only (per day, not per purpose)
- **Display:** Override replaces the displayed number; original Meta value stored in DB but not shown
- **Revert:** Manual only — user clicks ↩ to restore Meta-synced value
- **Auth:** No changes — single-user app

---

## Architecture

### New DB Table

```sql
CREATE TABLE IF NOT EXISTS daily_overrides (
    date        DATE         NOT NULL,
    metric      VARCHAR(32)  NOT NULL DEFAULT 'leads',
    value       INTEGER      NOT NULL,
    updated_at  TIMESTAMP    DEFAULT NOW(),
    PRIMARY KEY (date, metric)
);
```

Composite PK on `(date, metric)` — supports future expansion to other metrics without schema changes.

### Backend Changes (`metaads/backend/meta_analytics.py`)

**1. Table creation on startup**
Add `CREATE TABLE IF NOT EXISTS daily_overrides ...` to the startup DB init block (alongside existing table creation).

**2. Extend `GET /api/daily` row shape**
Current row shape:
```json
{ "date": "2026-05-17", "total_spend": 120.5, "total_leads": 14, "total_cpl": 8.61, "by_purpose": {...} }
```
New row shape (add one field):
```json
{ "date": "2026-05-17", "total_spend": 120.5, "total_leads": 14, "actual_leads": 18, "total_cpl": 8.61, "by_purpose": {...} }
```
`actual_leads` is the override value (integer) if one exists, otherwise `null`.

Implementation: after fetching daily rows, do a single `SELECT date, value FROM daily_overrides WHERE metric = 'leads' AND date = ANY(...)` for the date range, then merge into the rows dict.

**3. New endpoint: upsert override**
```
POST /api/daily/override
Body: { "date": "2026-05-17", "value": 18 }
```
- Validates: `date` must be a valid date string (`YYYY-MM-DD`), not in the future
- Validates: `value` must be a non-negative integer
- Upserts into `daily_overrides` with `ON CONFLICT (date, metric) DO UPDATE SET value = ..., updated_at = NOW()`
- Returns: `{ "date": "2026-05-17", "metric": "leads", "value": 18 }`

**4. New endpoint: remove override**
```
DELETE /api/daily/override/{date}
```
- Removes row from `daily_overrides` where `date = {date}` and `metric = 'leads'`
- Returns 204 No Content (even if no row existed — idempotent)

---

## Frontend Changes (`frontend/src/pages/DailyLog.jsx`)

### New state
```js
const [editingDate, setEditingDate] = useState(null)  // date string being edited, or null
const [editValue,   setEditValue]   = useState('')     // text input value during edit
const [saving,      setSaving]      = useState(false)  // debounce double-save
```

### Edit flow
```
startEdit(date, currentValue) → sets editingDate + editValue
  User types → editValue updates
  ✓ clicked → saveOverride(date)
    api.post('/daily/override', { date, value: parseInt(editValue) })
    on success: update row in local data state (actual_leads = value), clear editingDate
    on error: show toast, clear editingDate
  ✕ clicked → cancelEdit() → clears editingDate
  Escape key → cancelEdit()

revertOverride(date) →
  api.delete(`/daily/override/${date}`)
  on success: update row in local data state (actual_leads = null)
  on error: show toast
```

### Modified `total_leads` column renderCell

```jsx
renderCell: (row) => {
  const displayLeads = row.actual_leads ?? row.total_leads
  const isOverridden = row.actual_leads != null

  if (editingDate === row.date) {
    return (
      <div className="flex items-center gap-1 justify-end">
        <input
          type="number"
          min="0"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') saveOverride(row.date)
            if (e.key === 'Escape') cancelEdit()
          }}
          className="w-16 text-right text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
          autoFocus
        />
        <button onClick={() => saveOverride(row.date)} className="text-green-600 hover:text-green-700 text-xs font-bold">✓</button>
        <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 justify-end group">
      <span className={`num font-semibold ${isOverridden ? 'text-[#1D9E75]' : 'text-gray-900'}`}>
        {displayLeads.toLocaleString()}
      </span>
      <button
        onClick={() => startEdit(row.date, displayLeads)}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity text-xs"
        title="Edit actual leads"
      >
        ✏
      </button>
      {isOverridden && (
        <button
          onClick={() => revertOverride(row.date)}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity text-xs"
          title={`Revert to Meta value: ${row.total_leads}`}
        >
          ↩
        </button>
      )}
    </div>
  )
}
```

Overridden values show in green (`#1D9E75` — the app's brand color), making edited days visually distinct at a glance.

### Updated `totals` useMemo

Replace:
```js
base.total_leads += r.total_leads
```
With:
```js
base.total_leads += r.actual_leads ?? r.total_leads
```

This ensures the footer "Total Leads" and "Total CPL" both reflect the corrected numbers.

### Data state update (avoid re-fetch on save)

On successful save/revert, patch the specific row's `actual_leads` field in the existing `data` state rather than re-fetching the entire `/daily` endpoint. Since `data.rows` is an array, find the index by `row.date` and spread-replace that element:

```js
setData(prev => ({
  ...prev,
  rows: prev.rows.map(r => r.date === date ? { ...r, actual_leads: newValue } : r)
}))
```

For revert, set `actual_leads: null`.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Network error on save | Toast: "Failed to save — try again". Edit state cleared. |
| Network error on revert | Toast: "Failed to revert". No state change. |
| Invalid value (non-number, negative) | Frontend blocks: `✓` button disabled if `editValue` is not a valid positive integer |
| Future date override | Backend rejects with 422: "Cannot override a future date" |
| No data for date range | No change — table shows empty state as before |

---

## Files Changed

| File | Change |
|---|---|
| `metaads/backend/meta_analytics.py` | Table creation, extend GET /api/daily, 2 new endpoints |
| `frontend/src/pages/DailyLog.jsx` | Edit state, modified total_leads column, updated totals memo |

No new files. No schema migrations to existing tables. No changes to other pages.
