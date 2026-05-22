# Klientlar — Client Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Klientlar page — a new dashboard page that joins Meta Ads data with Google Sheets lead/call/sales data to show the full client journey from ad view to sale.

**Architecture:** Three new PostgreSQL tables (`meta_leads`, `sheet_leads`, `tilda_submissions`) populated by an extended `sync.py` and a new Tilda webhook. A new FastAPI router (`backend/klientlar.py`) serves 5 endpoints. A new React page (`frontend/src/pages/Klientlar.jsx`) renders 4 features: Lead Quality Rate, Full Funnel, Creative Performance Table, and Lead Timeline drawer.

**Tech Stack:** Python/FastAPI, psycopg2, gspread 6.x, React 18, existing axios API client.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/klientlar.py` | **Create** | All Klientlar endpoints + DB table creation |
| `backend/main.py` | **Modify** | Include klientlar router |
| `sync/sync.py` | **Modify** | Call new sheet + Meta leads sync functions |
| `sync/sheets.py` | **Create** | Google Sheets → `sheet_leads` sync logic |
| `sync/meta_leads_sync.py` | **Create** | Meta Lead Ads API → `meta_leads` sync logic |
| `requirements.txt` | **Modify** | Add gspread, google-auth, pytest, httpx |
| `frontend/src/pages/Klientlar.jsx` | **Create** | Full Klientlar page (4 features) |
| `frontend/src/App.jsx` | **Modify** | Add `/klientlar` route |
| `frontend/src/components/Layout.jsx` | **Modify** | Add Klientlar nav item |
| `tests/test_klientlar.py` | **Create** | Backend endpoint tests |
| `tests/test_phone_norm.py` | **Create** | Phone normalization unit tests |

---

## Task 1: Add Dependencies

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add new Python dependencies**

Open `requirements.txt` and add these lines:

```
gspread==6.1.2
google-auth==2.29.0
pytest==8.2.0
httpx==0.27.0
pytest-asyncio==0.23.6
```

- [ ] **Step 2: Install them on the server**

```bash
ssh adbot@<server> "cd /home/adbot/metaads && venv/bin/pip install gspread==6.1.2 google-auth==2.29.0"
```

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "deps: add gspread, google-auth, pytest, httpx"
```

---

## Task 2: Phone Normalization Utility

**Files:**
- Create: `backend/phone.py`
- Create: `tests/test_phone_norm.py`

`★ Insight ─────────────────────────────────────`
Phone normalization is the join key across all three data sources. It lives in `backend/phone.py` so both the webhook handler and sync scripts import the same function. A bad normalization silently drops leads from the funnel — the tests here prevent that.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_phone_norm.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from backend.phone import normalize_phone

def test_sheet_format():
    assert normalize_phone('901234567') == '901234567'

def test_tilda_format():
    assert normalize_phone('+998-90-123-45-67') == '901234567'

def test_meta_format_with_country_code():
    assert normalize_phone('+998 90 123 4567') == '901234567'

def test_meta_format_no_spaces():
    assert normalize_phone('998901234567') == '901234567'

def test_nine_digits_no_code():
    assert normalize_phone('901234567') == '901234567'

def test_empty_returns_none():
    assert normalize_phone('') is None

def test_none_returns_none():
    assert normalize_phone(None) is None

def test_wrong_length_returns_none():
    assert normalize_phone('12345') is None

def test_strips_parentheses_and_spaces():
    assert normalize_phone('(90) 123-45-67') == '901234567'
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd "C:/Users/rusta/OneDrive/Рабочий стол/claudee"
python -m pytest tests/test_phone_norm.py -v
```

Expected: `ModuleNotFoundError: No module named 'backend.phone'`

- [ ] **Step 3: Create `backend/phone.py`**

```python
import re
from typing import Optional


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """Normalize any Uzbek phone number to 9-digit format (e.g. '901234567').

    Handles:
    - Sheet format: 901234567
    - Tilda format: +998-90-123-45-67
    - Meta format: +998 90 123 4567 or 998901234567
    - Parentheses/dashes/spaces stripped

    Returns None if the result is not exactly 9 digits.
    """
    if not raw:
        return None
    digits = re.sub(r'\D', '', raw)
    if digits.startswith('998'):
        digits = digits[3:]
    if len(digits) != 9:
        return None
    return digits
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
python -m pytest tests/test_phone_norm.py -v
```

Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add backend/phone.py tests/test_phone_norm.py
git commit -m "feat: add phone normalization utility with tests"
```

---

## Task 3: DB Tables + Tilda Webhook

**Files:**
- Create: `backend/klientlar.py`
- Modify: `backend/main.py`
- Create: `tests/test_klientlar.py`

- [ ] **Step 1: Write failing test for webhook**

Create `tests/test_klientlar.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from fastapi.testclient import TestClient

# Mock DB so tests don't need a live Postgres
import unittest.mock as mock

# Patch DBConn before importing app
with mock.patch('backend.database.get_pool'):
    from backend.main import app

client = TestClient(app)


def test_tilda_webhook_returns_ok(monkeypatch):
    """Webhook must accept any payload and return {ok: true}."""
    # Patch the DB insert so no real DB needed
    mock_conn = mock.MagicMock()
    mock_conn.__enter__ = mock.MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = mock.MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = mock.MagicMock(return_value=mock.MagicMock())
    mock_conn.cursor.return_value.__exit__ = mock.MagicMock(return_value=False)

    monkeypatch.setattr('backend.klientlar.DBConn', lambda: mock_conn)

    response = client.post('/api/webhooks/tilda', json={
        'phone': '+998-90-123-45-67',
        'name': 'Test User',
        'formid': 'abc123'
    })
    assert response.status_code == 200
    assert response.json() == {'ok': True}


def test_tilda_webhook_no_phone(monkeypatch):
    """Webhook must still return ok even if no phone field."""
    mock_conn = mock.MagicMock()
    mock_conn.__enter__ = mock.MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = mock.MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = mock.MagicMock(return_value=mock.MagicMock())
    mock_conn.cursor.return_value.__exit__ = mock.MagicMock(return_value=False)

    monkeypatch.setattr('backend.klientlar.DBConn', lambda: mock_conn)

    response = client.post('/api/webhooks/tilda', json={'name': 'No phone'})
    assert response.status_code == 200
    assert response.json() == {'ok': True}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
python -m pytest tests/test_klientlar.py -v
```

Expected: `ImportError` or `404` — `klientlar` router not yet registered.

- [ ] **Step 3: Create `backend/klientlar.py`**

```python
from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import date, timedelta
import json, logging

from .auth import get_current_user
from .database import DBConn
from .phone import normalize_phone

router = APIRouter(prefix='/api', tags=['klientlar'])
log = logging.getLogger(__name__)


# ─── DB setup ────────────────────────────────────────────────────────────────

def _ensure_tables(conn):
    with conn.cursor() as cur:
        cur.execute('''
            CREATE TABLE IF NOT EXISTS meta_leads (
                lead_id       TEXT PRIMARY KEY,
                form_id       TEXT NOT NULL,
                campaign_id   TEXT,
                adset_id      TEXT,
                ad_id         TEXT,
                phone_raw     TEXT,
                phone_norm    TEXT,
                created_time  TIMESTAMPTZ,
                synced_at     TIMESTAMPTZ DEFAULT NOW()
            )
        ''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_meta_leads_phone ON meta_leads (phone_norm)')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_meta_leads_ad_time ON meta_leads (ad_id, created_time)')

        cur.execute('''
            CREATE TABLE IF NOT EXISTS sheet_leads (
                phone_norm        TEXT PRIMARY KEY,
                crm_date          DATE,
                manager           TEXT,
                status_name       TEXT,
                status_semantic   TEXT,
                source            TEXT,
                first_contact_at  TIMESTAMPTZ,
                contact_delay_min NUMERIC,
                total_calls       INT,
                positive_calls    INT,
                sale_date         DATE,
                sale_amount       NUMERIC,
                sale_manager      TEXT,
                synced_at         TIMESTAMPTZ DEFAULT NOW()
            )
        ''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_sheet_leads_date ON sheet_leads (crm_date)')

        cur.execute('''
            CREATE TABLE IF NOT EXISTS tilda_submissions (
                id          SERIAL PRIMARY KEY,
                received_at TIMESTAMPTZ DEFAULT NOW(),
                phone_raw   TEXT,
                phone_norm  TEXT,
                raw_data    JSONB
            )
        ''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_tilda_received ON tilda_submissions (received_at)')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_tilda_phone ON tilda_submissions (phone_norm)')
    conn.commit()


def _ensure_klientlar_tables():
    with DBConn() as conn:
        _ensure_tables(conn)


# ─── Tilda webhook (no auth) ─────────────────────────────────────────────────

@router.post('/webhooks/tilda')
def tilda_webhook(payload: dict):
    """Log every Tilda form submission — even junk. Never reject."""
    phone_raw = payload.get('phone') or payload.get('Phone') or payload.get('PHONE')
    phone_norm = normalize_phone(phone_raw) if phone_raw else None

    with DBConn() as conn:
        _ensure_tables(conn)
        with conn.cursor() as cur:
            cur.execute(
                'INSERT INTO tilda_submissions (phone_raw, phone_norm, raw_data) VALUES (%s, %s, %s)',
                (phone_raw, phone_norm, json.dumps(payload))
            )
    return {'ok': True}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _date_range(date_from: Optional[str], date_to: Optional[str]):
    today = date.today()
    d_to = date.fromisoformat(date_to) if date_to else today
    d_from = date.fromisoformat(date_from) if date_from else today - timedelta(days=29)
    return str(d_from), str(d_to)


# ─── Lead Quality Rate ────────────────────────────────────────────────────────

@router.get('/klientlar/quality')
def lead_quality_rate(
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    user=Depends(get_current_user)
):
    d_from, d_to = _date_range(date_from, date_to)
    with DBConn() as conn:
        _ensure_tables(conn)
        with conn.cursor() as cur:
            # Meta leads per day
            cur.execute('''
                SELECT DATE(created_time) as day, COUNT(*) as cnt
                FROM meta_leads
                WHERE DATE(created_time) BETWEEN %s AND %s
                GROUP BY day ORDER BY day DESC
            ''', (d_from, d_to))
            meta_by_day = {str(r[0]): r[1] for r in cur.fetchall()}

            # Tilda submissions per day
            cur.execute('''
                SELECT DATE(received_at) as day, COUNT(*) as cnt
                FROM tilda_submissions
                WHERE DATE(received_at) BETWEEN %s AND %s
                GROUP BY day ORDER BY day DESC
            ''', (d_from, d_to))
            tilda_by_day = {str(r[0]): r[1] for r in cur.fetchall()}

            # Sheet leads (distributed) per day
            cur.execute('''
                SELECT crm_date, COUNT(*) as cnt
                FROM sheet_leads
                WHERE crm_date BETWEEN %s AND %s
                GROUP BY crm_date ORDER BY crm_date DESC
            ''', (d_from, d_to))
            sheet_by_day = {str(r[0]): r[1] for r in cur.fetchall()}

            # Meta leads by source (campaign → project via joins)
            cur.execute('''
                SELECT
                    DATE(ml.created_time) as day,
                    COALESCE(sl.source, 'Unknown') as source,
                    COUNT(*) as cnt
                FROM meta_leads ml
                LEFT JOIN sheet_leads sl ON sl.phone_norm = ml.phone_norm
                WHERE DATE(ml.created_time) BETWEEN %s AND %s
                GROUP BY day, source
            ''', (d_from, d_to))
            source_rows = cur.fetchall()

    # Build per-day response
    all_days = sorted(set(list(meta_by_day.keys()) + list(tilda_by_day.keys()) + list(sheet_by_day.keys())), reverse=True)
    result = []
    for day in all_days:
        meta_cnt   = meta_by_day.get(day, 0)
        tilda_cnt  = tilda_by_day.get(day, 0)
        total      = meta_cnt + tilda_cnt
        distributed = sheet_by_day.get(day, 0)
        filtered   = max(total - distributed, 0)
        quality_pct = round(distributed / total * 100, 1) if total > 0 else 0

        # Source breakdown from join
        sources = {}
        for r in source_rows:
            if str(r[0]) == day:
                sources[r[1]] = r[2]

        result.append({
            'date':           day,
            'meta_count':     meta_cnt,
            'tilda_count':    tilda_cnt,
            'total_received': total,
            'distributed':    distributed,
            'filtered':       filtered,
            'quality_pct':    quality_pct,
            'last_sheet_sync': None,  # populated from sync metadata in future
            'by_source':      sources,
        })

    return result


# ─── Full Funnel ──────────────────────────────────────────────────────────────

@router.get('/klientlar/funnel')
def full_funnel(
    date_from:   Optional[str] = Query(None),
    date_to:     Optional[str] = Query(None),
    campaign_id: Optional[str] = Query(None),
    source:      Optional[str] = Query(None),
    manager:     Optional[str] = Query(None),
    user=Depends(get_current_user)
):
    d_from, d_to = _date_range(date_from, date_to)
    with DBConn() as conn:
        _ensure_tables(conn)
        with conn.cursor() as cur:
            # Total received
            params = [d_from, d_to]
            campaign_filter = 'AND ml.campaign_id = %s' if campaign_id else ''
            if campaign_id:
                params.append(campaign_id)
            source_filter = 'AND sl.source = %s' if source else ''
            if source:
                params.append(source)
            manager_filter = 'AND sl.manager = %s' if manager else ''
            if manager:
                params.append(manager)

            cur.execute(f'''
                SELECT COUNT(DISTINCT ml.lead_id)
                FROM meta_leads ml
                LEFT JOIN sheet_leads sl ON sl.phone_norm = ml.phone_norm
                WHERE DATE(ml.created_time) BETWEEN %s AND %s
                {campaign_filter} {source_filter} {manager_filter}
            ''', params)
            received = cur.fetchone()[0]

            cur.execute(f'''
                SELECT
                    COUNT(*) as distributed,
                    COUNT(*) FILTER (WHERE sl.total_calls > 0) as called,
                    COUNT(*) FILTER (WHERE sl.positive_calls > 0) as contacted,
                    COUNT(*) FILTER (WHERE sl.status_name = 'Sifatli lead') as qualified,
                    COUNT(*) FILTER (WHERE sl.sale_date IS NOT NULL) as sold
                FROM sheet_leads sl
                WHERE sl.crm_date BETWEEN %s AND %s
                {source_filter if source else ''} {manager_filter if manager else ''}
            ''', ([d_from, d_to] + ([source] if source else []) + ([manager] if manager else [])))
            r = cur.fetchone()
            distributed, called, contacted, qualified, sold = r

    def pct(a, b):
        return round(a / b * 100, 1) if b > 0 else 0

    return {
        'received':    received,
        'distributed': distributed,
        'called':      called,
        'contacted':   contacted,
        'qualified':   qualified,
        'sold':        sold,
        'rates': {
            'filter_rate':  pct(distributed, received),
            'call_rate':    pct(called, distributed),
            'answer_rate':  pct(contacted, called),
            'qualify_rate': pct(qualified, contacted),
            'close_rate':   pct(sold, qualified),
            'overall_rate': pct(sold, received),
        }
    }


# ─── Creative Performance ─────────────────────────────────────────────────────

@router.get('/klientlar/creatives')
def creative_performance(
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    user=Depends(get_current_user)
):
    d_from, d_to = _date_range(date_from, date_to)
    with DBConn() as conn:
        _ensure_tables(conn)
        with conn.cursor() as cur:
            cur.execute('''
                SELECT
                    COALESCE(a.name, 'Unknown creative') as ad_name,
                    COALESCE(ml.ad_id, '__unknown__') as ad_id,
                    COUNT(DISTINCT ml.lead_id) as lead_count,
                    COUNT(DISTINCT sl.phone_norm) FILTER (WHERE sl.positive_calls > 0) as contacted_count,
                    COUNT(DISTINCT sl.phone_norm) FILTER (WHERE sl.sale_date IS NOT NULL) as sold_count,
                    COALESCE(SUM(DISTINCT ai.spend), 0) as spend
                FROM meta_leads ml
                LEFT JOIN sheet_leads sl ON sl.phone_norm = ml.phone_norm
                LEFT JOIN ads a ON a.meta_id = ml.ad_id
                LEFT JOIN (
                    SELECT ad_id, SUM(spend) as spend
                    FROM ad_insights
                    WHERE ds BETWEEN %s AND %s
                    GROUP BY ad_id
                ) ai ON ai.ad_id = ml.ad_id
                WHERE DATE(ml.created_time) BETWEEN %s AND %s
                GROUP BY ad_name, ml.ad_id
                ORDER BY lead_count DESC
            ''', (d_from, d_to, d_from, d_to))
            rows = cur.fetchall()

            # Tilda row (not in meta_leads)
            cur.execute('''
                SELECT
                    COUNT(*) as lead_count,
                    COUNT(*) FILTER (WHERE sl.positive_calls > 0) as contacted_count,
                    COUNT(*) FILTER (WHERE sl.sale_date IS NOT NULL) as sold_count
                FROM tilda_submissions ts
                LEFT JOIN sheet_leads sl ON sl.phone_norm = ts.phone_norm
                WHERE DATE(ts.received_at) BETWEEN %s AND %s
            ''', (d_from, d_to))
            tr = cur.fetchone()

    result = []
    for r in rows:
        ad_name, ad_id, leads, contacted, sold, spend = r
        cpl = round(float(spend) / leads, 2) if leads > 0 and spend > 0 else None
        cost_per_sale = round(float(spend) / sold, 2) if sold > 0 and spend > 0 else None
        result.append({
            'ad_name':       ad_name,
            'ad_id':         ad_id,
            'lead_count':    leads,
            'contacted_count': contacted,
            'sold_count':    sold,
            'spend':         round(float(spend), 2),
            'cpl':           cpl,
            'cost_per_sale': cost_per_sale,
        })

    # Add Tilda row
    if tr and tr[0] > 0:
        result.append({
            'ad_name':       'Tilda (no UTM)',
            'ad_id':         '__tilda__',
            'lead_count':    tr[0],
            'contacted_count': tr[1],
            'sold_count':    tr[2],
            'spend':         None,
            'cpl':           None,
            'cost_per_sale': None,
        })

    return result


# ─── Individual Lead Timeline ─────────────────────────────────────────────────

@router.get('/klientlar/lead/{phone_norm}')
def lead_timeline(phone_norm: str, user=Depends(get_current_user)):
    with DBConn() as conn:
        _ensure_tables(conn)
        with conn.cursor() as cur:
            # Meta lead + ad attribution
            cur.execute('''
                SELECT
                    ml.lead_id, ml.phone_raw, ml.created_time,
                    ml.campaign_id, ml.adset_id, ml.ad_id,
                    a.name as ad_name,
                    c.name as campaign_name,
                    ads2.name as adset_name
                FROM meta_leads ml
                LEFT JOIN ads a ON a.meta_id = ml.ad_id
                LEFT JOIN campaigns c ON c.meta_id = ml.campaign_id
                LEFT JOIN adsets ads2 ON ads2.meta_id = ml.adset_id
                WHERE ml.phone_norm = %s
                LIMIT 1
            ''', (phone_norm,))
            meta = cur.fetchone()

            # Tilda submission (fallback if no Meta record)
            cur.execute('''
                SELECT received_at, phone_raw, raw_data
                FROM tilda_submissions
                WHERE phone_norm = %s
                ORDER BY received_at ASC
                LIMIT 1
            ''', (phone_norm,))
            tilda = cur.fetchone()

            # Sheet data (calls, sale, manager)
            cur.execute('''
                SELECT phone_norm, crm_date, manager, status_name, status_semantic,
                       source, first_contact_at, contact_delay_min,
                       total_calls, positive_calls, sale_date, sale_amount, sale_manager
                FROM sheet_leads
                WHERE phone_norm = %s
            ''', (phone_norm,))
            sheet = cur.fetchone()

    if not meta and not tilda and not sheet:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail='Lead not found')

    # Determine source and submission time
    if meta:
        source = 'Meta'
        submitted_at = meta[2].isoformat() if meta[2] else None
        ad_name = meta[6]
        campaign_name = meta[7]
        adset_name = meta[8]
        phone_display = meta[1]
    else:
        source = 'Tilda'
        submitted_at = tilda[0].isoformat() if tilda else None
        ad_name = None
        campaign_name = None
        adset_name = None
        phone_display = tilda[1] if tilda else phone_norm

    result = {
        'phone_norm':     phone_norm,
        'phone_display':  phone_display,
        'source':         source,
        'submitted_at':   submitted_at,
        'ad_name':        ad_name,
        'campaign_name':  campaign_name,
        'adset_name':     adset_name,
        'manager':        sheet[2] if sheet else None,
        'status_name':    sheet[3] if sheet else None,
        'status_semantic': sheet[4] if sheet else None,
        'first_contact_at': sheet[6].isoformat() if sheet and sheet[6] else None,
        'contact_delay_min': float(sheet[7]) if sheet and sheet[7] else None,
        'total_calls':    sheet[8] if sheet else None,
        'positive_calls': sheet[9] if sheet else None,
        'qualified':      (sheet[3] == 'Sifatli lead') if sheet else False,
        'sale_date':      str(sheet[10]) if sheet and sheet[10] else None,
        'sale_amount':    float(sheet[11]) if sheet and sheet[11] else None,
        'sale_manager':   sheet[12] if sheet else None,
    }
    return result
```

- [ ] **Step 4: Register router in `backend/main.py`**

Open `backend/main.py` and add after the existing `from .meta import router as meta_router` line:

```python
from .klientlar import router as klientlar_router
```

And after `app.include_router(meta_router)`:

```python
app.include_router(klientlar_router)
```

- [ ] **Step 5: Run tests — expect pass**

```bash
python -m pytest tests/test_klientlar.py -v
```

Expected: 2 passed

- [ ] **Step 6: Commit**

```bash
git add backend/klientlar.py backend/main.py tests/test_klientlar.py
git commit -m "feat: add Klientlar router with DB tables, Tilda webhook, and all 4 endpoints"
```

---

## Task 4: Google Sheets Sync Module

**Files:**
- Create: `sync/sheets.py`

`★ Insight ─────────────────────────────────────`
The sheet has two logical sections that need to be merged by phone_norm during sync. We use a full-table upsert (INSERT ... ON CONFLICT DO UPDATE) rather than DELETE+INSERT to avoid losing rows if the sheet is temporarily unavailable.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Create `sync/` directory and `sync/sheets.py`**

```bash
mkdir -p sync
```

Create `sync/sheets.py`:

```python
"""Sync Google Sheets Leadlar tab → sheet_leads PostgreSQL table."""

import logging
import re
from datetime import datetime, date
from typing import Optional

import gspread
from google.oauth2.service_account import Credentials

log = logging.getLogger(__name__)

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
]


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """Same normalization as backend/phone.py — duplicated here so sync
    can run independently without importing the FastAPI app."""
    if not raw:
        return None
    digits = re.sub(r'\D', '', str(raw))
    if digits.startswith('998'):
        digits = digits[3:]
    if len(digits) != 9:
        return None
    return digits


def _open_sheet(creds_path: str, spreadsheet_id: str):
    creds = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
    gc = gspread.authorize(creds)
    return gc.open_by_key(spreadsheet_id)


def _find_section(rows: list[list], header_keywords: list[str]) -> tuple[int, int]:
    """Return (header_row_idx, data_start_idx) for first section whose header
    row contains ALL of the given keywords (case-insensitive)."""
    for i, row in enumerate(rows):
        row_text = ' '.join(str(c) for c in row).lower()
        if all(kw.lower() in row_text for kw in header_keywords):
            return i, i + 1
    return -1, -1


def sync_sheet_leads(creds_path: str, spreadsheet_id: str, conn) -> int:
    """Read the Leadlar tab, merge both sections by phone_norm, upsert into
    sheet_leads. Returns number of rows upserted."""
    spreadsheet = _open_sheet(creds_path, spreadsheet_id)

    # Find the sheet named 'leadlar' (case-insensitive)
    worksheet = None
    for ws in spreadsheet.worksheets():
        if ws.title.lower() == 'leadlar':
            worksheet = ws
            break
    if not worksheet:
        log.warning('No sheet named "leadlar" found. Available: %s',
                    [ws.title for ws in spreadsheet.worksheets()])
        return 0

    all_rows = worksheet.get_all_values()
    log.info('  Sheet has %d rows total', len(all_rows))

    # ── Parse Section 1: CRM status data ─────────────────────────────────────
    # Headers contain: ASSIGNED_BY_NAME, STATUS_NAME, PHONE, DATE_CREATE
    crm_header_idx, crm_data_idx = _find_section(
        all_rows, ['STATUS_NAME', 'PHONE', 'DATE_CREATE']
    )
    crm_data = {}  # phone_norm → {manager, status_name, status_semantic, crm_date}
    if crm_header_idx >= 0:
        headers = [h.strip().upper() for h in all_rows[crm_header_idx]]
        col = {h: i for i, h in enumerate(headers)}
        for row in all_rows[crm_data_idx:]:
            if len(row) <= max(col.values(), default=0):
                continue
            phone_raw = row[col.get('PHONE', -1)] if 'PHONE' in col else ''
            phone = normalize_phone(phone_raw)
            if not phone:
                continue
            # STATUS_SEMANTIC is inferred from STATUS_NAME
            sname = row[col.get('STATUS_NAME', -1)] if 'STATUS_NAME' in col else ''
            if sname == 'Sifatli lead':
                semantic = 'Успех'
            elif sname in ('Start', 'Biznes yo\'q', 'Kichik biznes',
                           'Nomer xato', 'Full contact', 'Salbiy munosabat',
                           '13. Duplicat'):
                semantic = 'Провал'
            else:
                semantic = 'В работе'

            date_raw = row[col.get('DATE_CREATE', -1)] if 'DATE_CREATE' in col else ''
            crm_date = None
            for fmt in ('%Y-%m-%d', '%d.%m.%Y', '%m/%d/%Y'):
                try:
                    crm_date = datetime.strptime(date_raw, fmt).date()
                    break
                except (ValueError, TypeError):
                    continue

            manager = row[col.get('ASSIGNED_BY_NAME', -1)] if 'ASSIGNED_BY_NAME' in col else ''
            crm_data[phone] = {
                'manager': manager.strip(),
                'status_name': sname.strip(),
                'status_semantic': semantic,
                'crm_date': crm_date,
            }
        log.info('  CRM section: %d leads', len(crm_data))

    # ── Parse Section 2: Call tracking data ──────────────────────────────────
    # Headers contain: Crmga tushgan sanasi, Qancha kech, Sotuv summa
    call_header_idx, call_data_idx = _find_section(
        all_rows, ['Sotuv summa', 'Qancha kech']
    )
    call_data = {}  # phone_norm → {source, first_contact_at, contact_delay_min, ...}
    if call_header_idx >= 0:
        headers = all_rows[call_header_idx]
        # Find column indices by position (headers are in Uzbek/Russian)
        # Column order from analysis:
        # 0:type, 1:crm_date, 2:crm_time, 3:manager, 4:phone1, 5:phone2,
        # 6:same_day_calls, 7:same_day_positive, 8:same_day_minutes,
        # 9:total_calls, 10:positive_calls, 11:total_minutes,
        # 12:lead_date, 13:first_contact_time, 14:delay_min,
        # 15:sale_date, 16:sale_manager, 17:sale_amount
        for row in all_rows[call_data_idx:]:
            if len(row) < 5:
                continue
            phone_raw = row[4] if len(row) > 4 else ''
            phone = normalize_phone(phone_raw)
            if not phone:
                # Try second phone column
                phone_raw = row[5] if len(row) > 5 else ''
                phone = normalize_phone(phone_raw)
            if not phone:
                continue

            source = row[0].strip() if row[0] else None  # 'Target' or 'Milliard'

            # First contact time
            contact_time_raw = row[13] if len(row) > 13 else ''
            first_contact_at = None
            crm_date_raw = row[1] if len(row) > 1 else ''
            if contact_time_raw and contact_time_raw.strip() not in ('-', '—', ''):
                for fmt in ('%d.%m.%Y %H:%M', '%Y-%m-%d %H:%M'):
                    try:
                        first_contact_at = datetime.strptime(
                            f'{crm_date_raw} {contact_time_raw}'.strip(), fmt
                        )
                        break
                    except (ValueError, TypeError):
                        continue

            # Contact delay
            delay_raw = row[14] if len(row) > 14 else ''
            contact_delay_min = None
            try:
                v = str(delay_raw).replace(',', '.').strip()
                if v not in ('-', '—', ''):
                    contact_delay_min = float(v)
            except (ValueError, TypeError):
                pass

            # Call counts
            def _int(v):
                try:
                    return int(str(v).strip())
                except (ValueError, TypeError):
                    return 0

            total_calls    = _int(row[9]) if len(row) > 9 else 0
            positive_calls = _int(row[10]) if len(row) > 10 else 0

            # Sale info
            sale_date_raw = row[15] if len(row) > 15 else ''
            sale_date = None
            for fmt in ('%d.%m.%Y', '%Y-%m-%d'):
                try:
                    sale_date = datetime.strptime(sale_date_raw.strip(), fmt).date()
                    break
                except (ValueError, TypeError):
                    continue

            sale_manager = row[16].strip() if len(row) > 16 and row[16] else None

            sale_amount_raw = row[17] if len(row) > 17 else ''
            sale_amount = None
            try:
                v = str(sale_amount_raw).replace(' ', '').replace(',', '.').strip()
                if v not in ('-', '—', ''):
                    sale_amount = float(v)
            except (ValueError, TypeError):
                pass

            call_data[phone] = {
                'source': source,
                'first_contact_at': first_contact_at,
                'contact_delay_min': contact_delay_min,
                'total_calls': total_calls,
                'positive_calls': positive_calls,
                'sale_date': sale_date,
                'sale_amount': sale_amount,
                'sale_manager': sale_manager,
            }
        log.info('  Call tracking section: %d leads', len(call_data))

    # ── Merge and upsert ──────────────────────────────────────────────────────
    all_phones = set(crm_data.keys()) | set(call_data.keys())
    upserted = 0
    with conn.cursor() as cur:
        for phone in all_phones:
            crm = crm_data.get(phone, {})
            call = call_data.get(phone, {})
            cur.execute('''
                INSERT INTO sheet_leads (
                    phone_norm, crm_date, manager, status_name, status_semantic,
                    source, first_contact_at, contact_delay_min,
                    total_calls, positive_calls, sale_date, sale_amount, sale_manager,
                    synced_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                ON CONFLICT (phone_norm) DO UPDATE SET
                    crm_date          = EXCLUDED.crm_date,
                    manager           = EXCLUDED.manager,
                    status_name       = EXCLUDED.status_name,
                    status_semantic   = EXCLUDED.status_semantic,
                    source            = EXCLUDED.source,
                    first_contact_at  = EXCLUDED.first_contact_at,
                    contact_delay_min = EXCLUDED.contact_delay_min,
                    total_calls       = EXCLUDED.total_calls,
                    positive_calls    = EXCLUDED.positive_calls,
                    sale_date         = EXCLUDED.sale_date,
                    sale_amount       = EXCLUDED.sale_amount,
                    sale_manager      = EXCLUDED.sale_manager,
                    synced_at         = NOW()
            ''', (
                phone,
                crm.get('crm_date'),
                crm.get('manager'),
                crm.get('status_name'),
                crm.get('status_semantic'),
                call.get('source'),
                call.get('first_contact_at'),
                call.get('contact_delay_min'),
                call.get('total_calls', 0),
                call.get('positive_calls', 0),
                call.get('sale_date'),
                call.get('sale_amount'),
                call.get('sale_manager'),
            ))
            upserted += 1
    conn.commit()
    log.info('  sheet_leads upserted: %d rows', upserted)
    return upserted
```

- [ ] **Step 2: Commit**

```bash
git add sync/sheets.py
git commit -m "feat: add Google Sheets sync module for sheet_leads"
```

---

## Task 5: Meta Lead Ads Sync Module

**Files:**
- Create: `sync/meta_leads_sync.py`

- [ ] **Step 1: Create `sync/meta_leads_sync.py`**

```python
"""Sync Meta Lead Ads API → meta_leads PostgreSQL table."""

import logging
import re
import time
from datetime import datetime
from typing import Optional

import requests

log = logging.getLogger(__name__)

META_API = 'https://graph.facebook.com/v19.0'


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    digits = re.sub(r'\D', '', str(raw))
    if digits.startswith('998'):
        digits = digits[3:]
    if len(digits) != 9:
        return None
    return digits


def _get_lead_forms(account_id: str, token: str) -> list[dict]:
    """Return all lead gen forms for the account."""
    forms = []
    url = f'{META_API}/act_{account_id}/leadgen_forms'
    params = {'access_token': token, 'fields': 'id,name,status', 'limit': 100}
    while url:
        r = requests.get(url, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        forms.extend(data.get('data', []))
        url = data.get('paging', {}).get('next')
        params = {}  # next URL already has all params
    return forms


def _get_leads_for_form(form_id: str, token: str, since_ts: Optional[int] = None) -> list[dict]:
    """Return all leads for a single form."""
    leads = []
    url = f'{META_API}/{form_id}/leads'
    params = {
        'access_token': token,
        'fields': 'id,created_time,ad_id,adset_id,campaign_id,field_data',
        'limit': 100,
    }
    if since_ts:
        params['filtering'] = f'[{{"field":"time_created","operator":"GREATER_THAN","value":{since_ts}}}]'

    while url:
        r = requests.get(url, params=params, timeout=30)
        if r.status_code == 429:
            log.warning('  Rate limit hit, sleeping 60s')
            time.sleep(60)
            r = requests.get(url, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        leads.extend(data.get('data', []))
        url = data.get('paging', {}).get('next')
        params = {}
    return leads


def _extract_phone(field_data: list[dict]) -> Optional[str]:
    """Extract phone from Meta lead field_data array."""
    for field in field_data:
        if field.get('name', '').lower() in ('phone_number', 'phone', 'telefon'):
            values = field.get('values', [])
            if values:
                return values[0]
    return None


def sync_meta_leads(account_id: str, token: str, conn, since_ts: Optional[int] = None) -> int:
    """Pull all lead records from Meta Lead Ads API and upsert into meta_leads.
    Returns number of leads upserted."""
    forms = _get_lead_forms(account_id, token)
    log.info('  Found %d lead forms for account %s', len(forms), account_id)

    total = 0
    with conn.cursor() as cur:
        for form in forms:
            form_id = form['id']
            leads = _get_leads_for_form(form_id, token, since_ts)
            log.info('    Form %s (%s): %d leads', form_id, form.get('name', '?'), len(leads))

            for lead in leads:
                field_data = lead.get('field_data', [])
                phone_raw = _extract_phone(field_data)
                phone_norm = normalize_phone(phone_raw)

                created_raw = lead.get('created_time')
                created_time = None
                if created_raw:
                    try:
                        created_time = datetime.fromisoformat(
                            created_raw.replace('+0000', '+00:00')
                        )
                    except ValueError:
                        pass

                cur.execute('''
                    INSERT INTO meta_leads (
                        lead_id, form_id, campaign_id, adset_id, ad_id,
                        phone_raw, phone_norm, created_time, synced_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                    ON CONFLICT (lead_id) DO UPDATE SET
                        phone_raw    = EXCLUDED.phone_raw,
                        phone_norm   = EXCLUDED.phone_norm,
                        campaign_id  = EXCLUDED.campaign_id,
                        adset_id     = EXCLUDED.adset_id,
                        ad_id        = EXCLUDED.ad_id,
                        synced_at    = NOW()
                ''', (
                    lead['id'],
                    form_id,
                    lead.get('campaign_id'),
                    lead.get('adset_id'),
                    lead.get('ad_id'),
                    phone_raw,
                    phone_norm,
                    created_time,
                ))
                total += 1
    conn.commit()
    log.info('  meta_leads upserted: %d', total)
    return total
```

- [ ] **Step 2: Commit**

```bash
git add sync/meta_leads_sync.py
git commit -m "feat: add Meta Lead Ads sync module for meta_leads"
```

---

## Task 6: Wire Sync Functions into sync.py

**Files:**
- Modify: `sync/sync.py` (server path: `/home/adbot/metaads/sync/sync.py`)

- [ ] **Step 1: Add imports at top of sync.py**

After the existing imports, add:

```python
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sync.sheets import sync_sheet_leads
from sync.meta_leads_sync import sync_meta_leads
```

- [ ] **Step 2: Add env var reads near the top of `main()`**

After `acquire_lock()` and `today = date.today()`, add:

```python
SHEETS_CREDS = os.getenv('GOOGLE_SHEETS_CREDS', '')
SHEETS_ID    = os.getenv('GOOGLE_SHEETS_ID', '')
META_TOKEN   = os.getenv('META_ACCESS_TOKEN', '')
```

- [ ] **Step 3: Call new sync functions at end of `main()`**

After the existing insights sync loop, add:

```python
# ── Sync Google Sheet leads ──────────────────────────────────────────
if SHEETS_CREDS and SHEETS_ID:
    log.info('Syncing Google Sheet leads')
    try:
        import psycopg2
        conn = psycopg2.connect(os.getenv('DATABASE_URL'))
        # Ensure tables exist
        from backend.klientlar import _ensure_tables
        _ensure_tables(conn)
        n = sync_sheet_leads(SHEETS_CREDS, SHEETS_ID, conn)
        conn.close()
        log.info('  sheet_leads: %d rows synced', n)
    except Exception as e:
        log.error('Sheet sync failed: %s', e)
else:
    log.warning('GOOGLE_SHEETS_CREDS or GOOGLE_SHEETS_ID not set — skipping sheet sync')

# ── Sync Meta lead records ───────────────────────────────────────────
if META_TOKEN:
    log.info('Syncing Meta lead records')
    try:
        conn = psycopg2.connect(os.getenv('DATABASE_URL'))
        _ensure_tables(conn)
        for project in projects:   # 'projects' is already iterated above in sync.py
            account_id = project.get('ad_account_id', '').replace('act_', '')
            if account_id:
                n = sync_meta_leads(account_id, META_TOKEN, conn)
                log.info('  account %s: %d meta leads synced', account_id, n)
        conn.close()
    except Exception as e:
        log.error('Meta leads sync failed: %s', e)
```

- [ ] **Step 4: Add env vars to server `.env`**

```bash
ssh adbot@<server> "echo 'GOOGLE_SHEETS_CREDS=/home/adbot/metaads/google-service-account.json' >> /home/adbot/metaads/.env"
ssh adbot@<server> "echo 'GOOGLE_SHEETS_ID=1uuAZWdXU9Ey3kwzPAZJrgdFEO1w-KH1XPKFUYZDmSuk' >> /home/adbot/metaads/.env"
```

- [ ] **Step 5: Upload service account JSON to server**

```bash
scp path/to/google-service-account.json adbot@<server>:/home/adbot/metaads/google-service-account.json
ssh adbot@<server> "chmod 600 /home/adbot/metaads/google-service-account.json"
```

- [ ] **Step 6: Deploy and test sync manually**

```bash
# SCP updated files
scp sync/sheets.py sync/meta_leads_sync.py adbot@<server>:/home/adbot/metaads/sync/
scp sync/sync.py adbot@<server>:/home/adbot/metaads/sync/

# Run sync manually and check output
ssh adbot@<server> "/home/adbot/metaads/venv/bin/python /home/adbot/metaads/sync/sync.py 2>&1 | tail -30"
```

Expected output includes:
```
INFO Syncing Google Sheet leads
INFO   sheet_leads: N rows synced
INFO Syncing Meta lead records
INFO   account XXXXXXX: N meta leads synced
```

- [ ] **Step 7: Commit**

```bash
git add sync/sync.py
git commit -m "feat: wire sheet and meta_leads sync into daily sync.py"
```

---

## Task 7: Frontend — Nav + Route

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Create: `frontend/src/pages/Klientlar.jsx` (skeleton)

- [ ] **Step 1: Add import and route to `App.jsx`**

Add import after the existing page imports:

```javascript
import Klientlar from './pages/Klientlar'
```

Add route inside the layout routes (after `daily` route):

```jsx
<Route path="klientlar" element={<Klientlar ctx={ctx} />} />
```

- [ ] **Step 2: Add nav item to `Layout.jsx`**

Find the Analytics section in the nav (around line 169) and add after the `daily` NavItem:

```jsx
<NavItem to="/klientlar">Klientlar</NavItem>
```

- [ ] **Step 3: Create skeleton `frontend/src/pages/Klientlar.jsx`**

```jsx
import { useState, useEffect } from 'react'
import api from '../api'

export default function Klientlar({ ctx }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [quality, setQuality]   = useState([])
  const [funnel, setFunnel]     = useState(null)
  const [creatives, setCreatives] = useState([])
  const [selectedLead, setSelectedLead] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [dateFrom, dateTo])

  async function loadAll() {
    setLoading(true)
    const params = {}
    if (dateFrom) params.date_from = dateFrom
    if (dateTo)   params.date_to   = dateTo

    try {
      const [qRes, fRes, cRes] = await Promise.all([
        api.get('/klientlar/quality', { params }),
        api.get('/klientlar/funnel',  { params }),
        api.get('/klientlar/creatives', { params }),
      ])
      setQuality(qRes.data)
      setFunnel(fRes.data)
      setCreatives(cRes.data)
    } catch (e) {
      console.error('Klientlar load failed', e)
    } finally {
      setLoading(false)
    }
  }

  async function openLead(phoneNorm) {
    if (!phoneNorm || phoneNorm.startsWith('__')) return
    try {
      const r = await api.get(`/klientlar/lead/${phoneNorm}`)
      setSelectedLead(r.data)
      setDrawerOpen(true)
    } catch (e) {
      console.error('Lead not found', e)
    }
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Klientlar</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Client path — from ad to sale</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <QualitySection data={quality} />
          <FunnelSection data={funnel} />
          <CreativesSection data={creatives} onLeadClick={openLead} />
        </div>
      )}

      {drawerOpen && selectedLead && (
        <LeadDrawer lead={selectedLead} onClose={() => setDrawerOpen(false)} />
      )}
    </div>
  )
}

// ── Placeholder sections — replaced in Tasks 8–11 ──────────────────────────

function QualitySection({ data }) {
  return <div style={{ background: '#fff', borderRadius: 10, padding: 20 }}>
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>F1 — Lead Quality Rate</div>
    <div style={{ fontSize: 12, color: '#9ca3af' }}>{data.length} days loaded</div>
  </div>
}

function FunnelSection({ data }) {
  if (!data) return null
  return <div style={{ background: '#fff', borderRadius: 10, padding: 20 }}>
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>F2 — Full Funnel</div>
    <div style={{ fontSize: 12, color: '#9ca3af' }}>
      {data.received} received → {data.distributed} distributed → {data.sold} sold
    </div>
  </div>
}

function CreativesSection({ data, onLeadClick }) {
  return <div style={{ background: '#fff', borderRadius: 10, padding: 20 }}>
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>F3 — Creative Performance</div>
    <div style={{ fontSize: 12, color: '#9ca3af' }}>{data.length} creatives</div>
  </div>
}

function LeadDrawer({ lead, onClose }) {
  return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 380, background: '#fff',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.12)', zIndex: 100, padding: 24, overflowY: 'auto' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16,
        background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280' }}>✕</button>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{lead.phone_display}</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Lead drawer placeholder</div>
    </div>
  )
}
```

- [ ] **Step 4: Open the app and verify Klientlar appears in nav and loads without errors**

```bash
cd frontend && npm run dev
```

Navigate to `/klientlar`. Expected: page loads, shows "F1/F2/F3 placeholder" sections with data counts from the API.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Klientlar.jsx frontend/src/App.jsx frontend/src/components/Layout.jsx
git commit -m "feat: add Klientlar page skeleton with nav and data loading"
```

---

## Task 8: Frontend F1 — Lead Quality Rate

**Files:**
- Modify: `frontend/src/pages/Klientlar.jsx` — replace `QualitySection`

- [ ] **Step 1: Replace the `QualitySection` placeholder with the full implementation**

Find `function QualitySection({ data })` and replace the entire function:

```jsx
function QualitySection({ data }) {
  if (!data || data.length === 0) return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>F1 — Lead Quality Rate</div>
      <div style={{ fontSize: 12, color: '#9ca3af' }}>No data for this period</div>
    </div>
  )

  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1D9E75', display: 'inline-block' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>F1 — Lead Quality Rate</span>
      </div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {data.map(day => (
          <DayCard key={day.date} day={day} />
        ))}
      </div>
    </div>
  )
}

function DayCard({ day }) {
  const qPct = day.quality_pct || 0
  const fPct = day.total_received > 0
    ? Math.round(day.filtered / day.total_received * 100)
    : 0

  return (
    <div style={{ minWidth: 140, background: '#f9fafb', border: '1px solid #e5e7eb',
      borderRadius: 8, padding: 12, flexShrink: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
        {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{day.total_received}</div>
      <div style={{ fontSize: 10, color: '#6b7280' }}>received</div>
      <div style={{ margin: '8px 0', height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${qPct}%`, height: '100%', background: '#1D9E75', borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: 11, color: '#1D9E75', fontWeight: 600 }}>
        {day.distributed} distributed ({qPct}%)
      </div>
      <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>
        {day.filtered} filtered ({fPct}%)
      </div>
      {day.by_source && Object.keys(day.by_source).length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
          {Object.entries(day.by_source).map(([src, cnt]) => (
            <div key={src} style={{ fontSize: 10, color: '#9ca3af' }}>
              {src}: {cnt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/klientlar`. Quality Rate section should show scrollable day cards with progress bars.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Klientlar.jsx
git commit -m "feat: implement F1 Lead Quality Rate day cards"
```

---

## Task 9: Frontend F2 — Full Funnel

**Files:**
- Modify: `frontend/src/pages/Klientlar.jsx` — replace `FunnelSection`

- [ ] **Step 1: Replace `FunnelSection` placeholder**

Find `function FunnelSection({ data })` and replace:

```jsx
const FUNNEL_STAGES = [
  { key: 'received',    label: 'Received',    color: '#1D9E75' },
  { key: 'distributed', label: 'Distributed', color: '#22c55e' },
  { key: 'called',      label: 'Called',      color: '#3b82f6' },
  { key: 'contacted',   label: 'Contacted',   color: '#8b5cf6' },
  { key: 'qualified',   label: 'Qualified',   color: '#f59e0b' },
  { key: 'sold',        label: 'Sold',        color: '#ef4444' },
]

const RATE_KEYS = [
  'filter_rate', 'call_rate', 'answer_rate', 'qualify_rate', 'close_rate'
]

function FunnelSection({ data }) {
  if (!data) return null

  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#378ADD', display: 'inline-block' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>F2 — Full Funnel</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>
          Overall: {data.rates?.overall_rate ?? 0}% (received → sold)
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
        {FUNNEL_STAGES.map((stage, i) => (
          <div key={stage.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <div style={{ background: stage.color, color: 'white', borderRadius: 8,
                padding: '10px 6px', fontSize: 16, fontWeight: 700 }}>
                {data[stage.key] ?? 0}
              </div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 5 }}>{stage.label}</div>
            </div>
            {i < FUNNEL_STAGES.length - 1 && (
              <div style={{ textAlign: 'center', fontSize: 12, color: '#d1d5db', lineHeight: 1.2 }}>
                →<br />
                <span style={{
                  fontSize: 9,
                  color: (data.rates?.[RATE_KEYS[i]] ?? 0) >= 70 ? '#1D9E75' :
                         (data.rates?.[RATE_KEYS[i]] ?? 0) >= 40 ? '#f59e0b' : '#ef4444'
                }}>
                  {data.rates?.[RATE_KEYS[i]] ?? 0}%
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser** — funnel shows 6 colored boxes with drop-off percentages.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Klientlar.jsx
git commit -m "feat: implement F2 Full Funnel visualization"
```

---

## Task 10: Frontend F3 — Creative Performance Table

**Files:**
- Modify: `frontend/src/pages/Klientlar.jsx` — replace `CreativesSection`

- [ ] **Step 1: Replace `CreativesSection` placeholder**

Find `function CreativesSection({ data, onLeadClick })` and replace:

```jsx
function CreativesSection({ data, onLeadClick }) {
  const [sortKey, setSortKey] = useState('lead_count')
  const [sortDir, setSortDir] = useState('desc')

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey] ?? -1
    const bv = b[sortKey] ?? -1
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const SortArrow = ({ k }) => sortKey === k
    ? <span style={{ marginLeft: 3, fontSize: 9 }}>{sortDir === 'desc' ? '▼' : '▲'}</span>
    : null

  const Th = ({ k, children, align = 'right' }) => (
    <th onClick={() => toggleSort(k)} style={{
      textAlign: align, padding: '6px 8px', color: '#6b7280', fontWeight: 600,
      fontSize: 11, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap'
    }}>
      {children}<SortArrow k={k} />
    </th>
  )

  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#BA7517', display: 'inline-block' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>F3 — Creative Performance</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af',
          background: '#f3f4f6', padding: '3px 8px', borderRadius: 4 }}>
          Click row → lead timeline
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            <Th k="ad_name" align="left">Ad</Th>
            <Th k="lead_count">Leads</Th>
            <Th k="contacted_count">Contacted</Th>
            <Th k="sold_count">Sold</Th>
            <Th k="cpl">CPL</Th>
            <Th k="cost_per_sale">Cost/Sale</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => {
            const isSpecial = row.ad_id === '__tilda__' || row.ad_id === '__unknown__'
            const contactPct = row.lead_count > 0
              ? Math.round(row.contacted_count / row.lead_count * 100) : 0
            const soldPct = row.lead_count > 0
              ? Math.round(row.sold_count / row.lead_count * 100) : 0

            return (
              <tr key={row.ad_id}
                onClick={() => !isSpecial && onLeadClick(row.ad_id)}
                style={{ borderBottom: '1px solid #f3f4f6',
                  cursor: isSpecial ? 'default' : 'pointer' }}
                onMouseEnter={e => { if (!isSpecial) e.currentTarget.style.background = '#f9fafb' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                <td style={{ padding: '8px', color: isSpecial ? '#9ca3af' : '#111827',
                  fontStyle: isSpecial ? 'italic' : 'normal', fontWeight: isSpecial ? 400 : 500 }}>
                  {row.ad_name}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#374151' }}>
                  {row.lead_count}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#374151' }}>
                  {row.contacted_count}
                  {row.lead_count > 0 && <span style={{ color: '#9ca3af', fontSize: 10 }}> ({contactPct}%)</span>}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#374151' }}>
                  {row.sold_count}
                  {row.lead_count > 0 && <span style={{ color: '#9ca3af', fontSize: 10 }}> ({soldPct}%)</span>}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: isSpecial ? '#9ca3af' : '#374151' }}>
                  {row.cpl != null ? `$${row.cpl.toFixed(2)}` : '—'}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: isSpecial ? '#9ca3af' : '#374151' }}>
                  {row.cost_per_sale != null ? `$${row.cost_per_sale.toFixed(2)}` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

Also add `useState` to the existing import at the top of the file if not already there (it already is from the skeleton).

- [ ] **Step 2: Verify in browser** — sortable creative table appears, Tilda/Unknown rows show in gray italic.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Klientlar.jsx
git commit -m "feat: implement F3 Creative Performance sortable table"
```

---

## Task 11: Frontend F4 — Lead Timeline Drawer

**Files:**
- Modify: `frontend/src/pages/Klientlar.jsx` — replace `LeadDrawer`

- [ ] **Step 1: Replace `LeadDrawer` placeholder**

Find `function LeadDrawer({ lead, onClose })` and replace:

```jsx
function LeadDrawer({ lead, onClose }) {
  function fmt(isoStr) {
    if (!isoStr) return null
    const d = new Date(isoStr)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }) +
           ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }

  const StatusBadge = ({ semantic }) => {
    const map = {
      'Успех':    { bg: '#dcfce7', color: '#166534', label: 'Won' },
      'Провал':   { bg: '#fee2e2', color: '#991b1b', label: 'Lost' },
      'В работе': { bg: '#eff6ff', color: '#1d4ed8', label: 'In progress' },
    }
    const s = map[semantic] || { bg: '#f3f4f6', color: '#6b7280', label: semantic || '?' }
    return (
      <span style={{ background: s.bg, color: s.color, padding: '2px 8px',
        borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
        {s.label}
      </span>
    )
  }

  const Row = ({ icon, label, value, subValue }) => value == null ? null : (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0',
      borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <span style={{ color: '#6b7280', fontSize: 12 }}>{label}:</span>{' '}
        <span style={{ fontSize: 12, color: '#111827' }}>{value}</span>
        {subValue && <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 6 }}>{subValue}</span>}
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 400,
      background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.14)',
      zIndex: 100, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid #eaecf0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px',
              borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
              {lead.phone_display || lead.phone_norm}
            </span>
            <span style={{ background: lead.source === 'Meta' ? '#eff6ff' : '#fdf4ff',
              color: lead.source === 'Meta' ? '#1d4ed8' : '#7e22ce',
              padding: '2px 6px', borderRadius: 3, fontSize: 10 }}>
              {lead.source}
            </span>
          </div>
          {lead.status_semantic && (
            <div style={{ marginTop: 6 }}>
              <StatusBadge semantic={lead.status_semantic} />
              {lead.status_name && (
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>
                  {lead.status_name}
                </span>
              )}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none',
          fontSize: 18, cursor: 'pointer', color: '#9ca3af', padding: '4px 8px' }}>✕</button>
      </div>

      {/* Timeline body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {/* Ad attribution */}
        {lead.ad_name && (
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 14,
            border: '1px solid #e5e7eb', fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: '#111827', marginBottom: 4 }}>📢 {lead.ad_name}</div>
            {lead.campaign_name && <div style={{ color: '#6b7280' }}>Campaign: {lead.campaign_name}</div>}
            {lead.adset_name && <div style={{ color: '#6b7280' }}>Adset: {lead.adset_name}</div>}
          </div>
        )}

        <Row icon="📋" label="Submitted" value={fmt(lead.submitted_at)} />
        <Row icon="👤" label="Assigned" value={lead.manager} />

        {/* Contact timing */}
        {lead.first_contact_at && (
          <Row
            icon="📞"
            label="First contact"
            value={fmt(lead.first_contact_at)}
            subValue={lead.contact_delay_min != null
              ? `(+${Math.round(lead.contact_delay_min)} min delay)`
              : null}
          />
        )}

        <Row icon="📞" label="Total calls"
          value={lead.total_calls != null ? `${lead.total_calls} calls (${lead.positive_calls || 0} answered)` : null} />

        <Row icon="🎯" label="Qualified"
          value={lead.qualified ? 'Yes ✅' : (lead.status_semantic === 'Провал' ? 'No ✗' : 'In progress…')} />

        {/* Sale */}
        {lead.sale_date ? (
          <div style={{ marginTop: 12, background: '#f0fdf4', borderRadius: 8, padding: 12,
            border: '1px solid #86efac' }}>
            <div style={{ fontWeight: 600, color: '#166534', marginBottom: 4 }}>💰 Sale</div>
            <div style={{ fontSize: 12, color: '#374151' }}>
              {lead.sale_date}
              {lead.sale_amount && ` · $${lead.sale_amount.toLocaleString()}`}
              {lead.sale_manager && ` · ${lead.sale_manager}`}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>
            💰 Sale: —
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser** — click any non-special creative row → drawer slides in with full lead timeline.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Klientlar.jsx
git commit -m "feat: implement F4 Lead Timeline side drawer"
```

---

## Task 12: Deploy

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

Expected: no errors, `dist/` created.

- [ ] **Step 2: SCP backend and sync files to server**

```bash
scp backend/klientlar.py backend/phone.py backend/main.py adbot@<server>:/home/adbot/metaads/backend/
scp sync/sheets.py sync/meta_leads_sync.py sync/sync.py adbot@<server>:/home/adbot/metaads/sync/
scp requirements.txt adbot@<server>:/home/adbot/metaads/
```

- [ ] **Step 3: Install new Python deps on server**

```bash
ssh adbot@<server> "cd /home/adbot/metaads && venv/bin/pip install gspread==6.1.2 google-auth==2.29.0"
```

- [ ] **Step 4: Restart backend**

```bash
ssh adbot@<server> "sudo systemctl restart metaads"
ssh adbot@<server> "sudo systemctl status metaads | head -10"
```

Expected: `active (running)`

- [ ] **Step 5: SCP built frontend to server**

```bash
scp -r frontend/dist/* adbot@<server>:/home/adbot/metaads/frontend/dist/
```

- [ ] **Step 6: Test the Tilda webhook manually**

```bash
curl -s -X POST https://<your-domain>/api/webhooks/tilda \
  -H 'Content-Type: application/json' \
  -d '{"phone": "+998-90-123-45-67", "name": "Test"}' | python3 -m json.tool
```

Expected: `{"ok": true}`

- [ ] **Step 7: Run a manual full sync and verify all 3 tables populate**

```bash
ssh adbot@<server> "/home/adbot/metaads/venv/bin/python /home/adbot/metaads/sync/sync.py 2>&1 | grep -E 'sheet_leads|meta_leads|tilda'"
```

Expected:
```
INFO   sheet_leads: N rows synced
INFO   meta_leads upserted: N
```

- [ ] **Step 8: Open Klientlar page in browser and verify all 4 sections show real data**

Navigate to `/klientlar`. Expected:
- F1: Day cards with real daily counts
- F2: Funnel with real received/sold numbers
- F3: Creative table with real ad names and lead counts
- F4: Click a row → drawer opens with real lead data

- [ ] **Step 9: Final commit**

```bash
git add .
git commit -m "feat: deploy Klientlar client path page — all 4 features live"
```

---

## Self-Review Against Spec

**Spec coverage:**
- ✅ `POST /api/webhooks/tilda` — Task 3
- ✅ `GET /api/klientlar/quality` — Task 3
- ✅ `GET /api/klientlar/funnel` — Task 3
- ✅ `GET /api/klientlar/creatives` — Task 3
- ✅ `GET /api/klientlar/lead/{phone_norm}` — Task 3
- ✅ 3 new DB tables — Task 3
- ✅ Phone normalization — Task 2
- ✅ Google Sheets sync — Task 4
- ✅ Meta Lead Ads sync — Task 5
- ✅ sync.py wiring — Task 6
- ✅ Frontend page with all 4 features — Tasks 7–11
- ✅ Tilda row + Unknown creative row — Task 3 (backend) + Task 10 (frontend)
- ✅ `gspread` + `google-auth` deps — Task 1
- ✅ Edge case: leads not in sheet shown as gap in quality rate — quality endpoint counts from both sources
- ✅ Edge case: null `ad_id` → "Unknown creative" — creative endpoint COALESCE
- ✅ Deploy steps — Task 12

**No placeholders found.** All code blocks are complete.

**Type consistency:** `phone_norm` used consistently across all backend functions. `ad_id` column name consistent with existing `ad_insights` table. `meta_id` used for joining ads/campaigns/adsets per existing pattern in `meta.py`.
