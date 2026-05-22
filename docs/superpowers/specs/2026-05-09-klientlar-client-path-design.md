# Klientlar — Client Path Feature Design

**Date:** 2026-05-09  
**Status:** Approved  
**Project:** MetaAds Dashboard (React + FastAPI + PostgreSQL)

---

## Overview

A new page called **Klientlar** added to the existing dashboard sidebar. It connects Meta Ads performance data with Google Sheets lead/call/sales data, giving a full picture of the client journey from ad view to sale.

The page is **read-only** — the Google Sheets workflow for managers stays completely unchanged.

---

## Architecture Decision

**All data syncs into PostgreSQL.** The existing `sync.py` is extended to pull from two new sources (Google Sheets + Meta Lead Ads API). The Tilda webhook logs directly to DB on receipt. All four Klientlar features query only PostgreSQL — no live external API calls at page load.

This matches the existing pattern exactly: Meta insights already flow through `sync.py` → PostgreSQL → FastAPI → React.

### Data Flow

```
Meta Ads API (Lead Ads)  ──┐
                           ├── sync.py (daily) ──► PostgreSQL ──► FastAPI ──► Klientlar page
Google Sheet (Leadlar)   ──┘

Tilda webhook  ──────────────────────────────────► PostgreSQL (on receipt)
```

### Phone Normalization (join key across all sources)

Every source uses a different phone format. Normalized form is always **9 digits, no country code**:

| Source | Raw example | Normalized |
|--------|-------------|------------|
| Google Sheet | `901234567` | `901234567` |
| Tilda | `+998-90-123-45-67` | `901234567` |
| Meta | `+998 90 123 4567` | `901234567` |

**Rule:** strip all non-digit characters → if starts with `998`, remove it → keep last 9 digits.

Applied at sync time (stored as `phone_norm`) and at webhook receipt.

---

## Database Schema

### New table: `meta_leads`

One row per individual lead submission from Meta Lead Ads API. Deduped by `lead_id`.

```sql
CREATE TABLE meta_leads (
    lead_id       TEXT PRIMARY KEY,
    form_id       TEXT NOT NULL,
    campaign_id   TEXT,
    adset_id      TEXT,
    ad_id         TEXT,
    phone_raw     TEXT,
    phone_norm    TEXT,
    created_time  TIMESTAMPTZ,
    synced_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON meta_leads (phone_norm);
CREATE INDEX ON meta_leads (ad_id, created_time);
```

### New table: `sheet_leads`

One row per lead from the Leadlar Google Sheet tab. Full refresh via upsert daily. Both sheet sections (CRM status + call tracking) are joined by `phone_norm` during sync and stored in a single row.

```sql
CREATE TABLE sheet_leads (
    phone_norm        TEXT PRIMARY KEY,
    crm_date          DATE,
    manager           TEXT,
    status_name       TEXT,
    status_semantic   TEXT,        -- 'В работе' | 'Провал' | 'Успех'
    source            TEXT,        -- 'Target' | 'Milliard' | NULL
    first_contact_at  TIMESTAMPTZ,
    contact_delay_min NUMERIC,
    total_calls       INT,
    positive_calls    INT,
    sale_date         DATE,
    sale_amount       NUMERIC,
    sale_manager      TEXT,
    synced_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON sheet_leads (crm_date);
```

### New table: `tilda_submissions`

Append-only log. Never deleted. Captures every Tilda form submission including junk.

```sql
CREATE TABLE tilda_submissions (
    id          SERIAL PRIMARY KEY,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    phone_raw   TEXT,
    phone_norm  TEXT,
    raw_data    JSONB
);
CREATE INDEX ON tilda_submissions (received_at);
CREATE INDEX ON tilda_submissions (phone_norm);
```

---

## Backend

### New file: `backend/klientlar.py`

FastAPI router included in `main.py`. All endpoints require JWT auth (same `get_current_user` dependency as `meta.py`).

#### `POST /api/webhooks/tilda`
- No authentication (Tilda calls this directly)
- Accepts any JSON body
- Extracts `phone` field → normalizes → inserts into `tilda_submissions`
- Returns `{"ok": true}`

#### `GET /api/klientlar/quality`
- Params: `date_from`, `date_to`
- Returns per-day breakdown:
  - `meta_count` — from `meta_leads.created_time`
  - `tilda_count` — from `tilda_submissions.received_at`
  - `distributed_count` — count of `sheet_leads` rows for that `crm_date`
  - `filtered_count` = `(meta_count + tilda_count) - distributed_count`
  - `quality_pct` = `distributed_count / (meta_count + tilda_count) × 100`
  - Broken down by source (Target / Milliard / Tilda)

#### `GET /api/klientlar/funnel`
- Params: `date_from`, `date_to`, `campaign_id?`, `source?`, `manager?`
- Returns funnel stage counts and conversion % between each stage:
  1. Received (`meta_leads` + `tilda_submissions`)
  2. Distributed (in `sheet_leads`)
  3. Called (`total_calls > 0`)
  4. Contacted (`positive_calls > 0`)
  5. Qualified (`status_name = 'Sifatli lead'`)
  6. Sold (`sale_date IS NOT NULL`)

#### `GET /api/klientlar/creatives`
- Params: `date_from`, `date_to`
- Joins `meta_leads` → `sheet_leads` on `phone_norm`, then to `ad_insights` on `ad_id`
- Returns per ad: `lead_count`, `contacted_count`, `sold_count`, `spend`, `cpl`, `cost_per_sale`
- Includes a fallback row for leads with `ad_id IS NULL` labeled `"Unknown creative"`
- Tilda leads (no UTM yet) appear as a separate `"Tilda (no UTM)"` row

#### `GET /api/klientlar/lead/{phone_norm}`
- Returns the full timeline for a single lead:
  - Ad creative name, campaign, adset (from `ads`, `campaigns`, `adsets` tables)
  - Submission timestamp + source
  - Assigned manager
  - Call events with delay calculation
  - Qualification status
  - Sale date + amount

### Changes to `sync.py`

Two new functions added, called daily after the existing insights sync:

**`sync_sheet_leads(creds_path, spreadsheet_id)`**
- Uses `gspread` library with service account JSON at `creds_path`
- Reads the full Leadlar tab
- Parses both sections (CRM status rows + call tracking rows)
- Normalizes phone numbers
- Joins by `phone_norm`
- Upserts into `sheet_leads`

**`sync_meta_leads(account_id, date_from)`**
- Calls `/leadgen_forms` to get all active form IDs for the account
- For each form, calls `/leadgen_forms/{id}/leads?fields=phone_number,created_time,ad_id,...`
- Normalizes phone numbers
- Upserts into `meta_leads` by `lead_id`

**New env vars needed in `.env`:**
```
GOOGLE_SHEETS_CREDS=/home/adbot/metaads/google-service-account.json
GOOGLE_SHEETS_ID=1uuAZWdXU9Ey3kwzPAZJrgdFEO1w-KH1XPKFUYZDmSuk
```

**New Python dependency:**
```
gspread>=6.0.0
```

---

## Frontend

### New file: `frontend/src/pages/Klientlar.jsx`

New route: `/klientlar` — added to `App.jsx` and `Layout.jsx` nav sidebar under the Analytics section.

#### Page structure (top to bottom)

**Header + Filters**
- Page title: "Klientlar" with subtitle "Client path — from ad to sale"
- Filter bar: date range picker, source dropdown (All / Target / Milliard / Tilda), manager dropdown
- "Last sheet sync: [timestamp]" shown top-right

**F1 — Lead Quality Rate**
- Horizontal scrollable row of day cards, most recent first
- Each card: date, total received (big number), progress bar, distributed count + %, filtered count + %
- Sub-breakdown per source (Target / Milliard / Tilda) shown below the bar

**F2 — Full Funnel**
- Horizontal funnel: 6 colored stage boxes connected by arrows with drop-off % between each
- Stage colors: green → blue → purple → amber → red (darkens as funnel narrows)
- Responds to source/manager/campaign filters

**F3 — Creative Performance Table**
- Columns: Ad name | Leads | Contacted (%) | Sold (%) | CPL | Cost/Sale
- Sortable columns
- "Tilda (no UTM)" and "Unknown creative" rows always shown at bottom in gray italic
- Clicking any row opens the Lead Timeline drawer (F4)

**F4 — Lead Timeline Drawer**
- Slides in from the right when a creative row is clicked
- Shows a list of individual leads from that creative
- Clicking a lead expands its full timeline:
  - 📢 Ad / Campaign / Adset
  - 📋 Submitted: date + time + source badge
  - 👤 Assigned manager
  - 📞 Call events (each with delay, duration, outcome)
  - 🎯 Qualified: Yes / No
  - 💰 Sale: amount + date, or —
- Close button returns to table

---

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Lead phone not found in sheet | Counted in "received", not in "distributed". Shown in quality rate as gap. |
| Lead with null `ad_id` in Meta | Grouped into "Unknown creative" row in F3 |
| Tilda leads without UTM | Shown as "Tilda (no UTM)" row — CPL and Cost/Sale shown as — |
| Phone format not matching normalization rule | Logged as warning in sync; lead stored with `phone_norm = NULL`, excluded from joins |
| Meta Lead Ads API 90-day history limit | Backfill run manually with `--date-from` flag on first sync |
| Sheet synced before daily manual review | Quality rate for today is incomplete; "last sheet sync" timestamp makes this visible |

---

## Out of Scope

- Changing the manual daily lead distribution workflow
- Replacing Google Sheets for managers
- Tracking rejection reasons for filtered leads
- Real-time manager notifications
- Auto-assigning leads
- UTM attribution for Tilda (comes later — no structural changes needed when ready)

---

## Future: When Tilda UTM Is Ready

The "Tilda (no UTM)" row in F3 will automatically split into real campaign rows once Tilda passes UTM params in the webhook payload. No schema or API changes needed — just populate `campaign_id`/`ad_id` in `tilda_submissions` at that point.
