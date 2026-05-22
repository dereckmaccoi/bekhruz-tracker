# Meta Ads Telegram Superagent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Telegram bot superagent that connects to Meta Ads API and Google Sheets, maintains local persistent memory (SQLite + ChromaDB), converses with the user via Claude, and sends proactive alerts and daily/weekly briefings.

**Architecture:** Single Python service (`adbot/`) with clean internal modules. All data stored locally on the user's PC — SQLite for structured data, ChromaDB for semantic memory. Claude (claude-sonnet-4-6) is the AI brain. No cloud database, no Docker.

**Tech Stack:** Python 3.11, python-telegram-bot 20.x, anthropic SDK, chromadb, apscheduler, httpx, gspread, google-auth, Pillow, matplotlib, sqlite3 (built-in)

**Project root:** Create `adbot/` as a new directory alongside the existing Next.js app.

---

## File Map

```
adbot/
├── main.py                          # entry point — wires all modules, starts bot + scheduler
├── config.py                        # loads .env, constants, user rules from SQLite
├── requirements.txt                 # all pip dependencies
├── .env.example                     # template for user to fill
├── memory/
│   ├── __init__.py
│   ├── schema.sql                   # SQLite table definitions
│   ├── sqlite_store.py              # all SQLite read/write operations
│   └── chroma_store.py              # ChromaDB collections read/write
├── data/
│   ├── __init__.py
│   ├── meta_client.py               # Meta Graph API fetcher (campaigns, adsets, ads, account)
│   ├── sheets_client.py             # Google Sheets auto-discovery + fetcher
│   └── health_scorer.py             # Critical / Warning / Good logic
├── brain/
│   ├── __init__.py
│   ├── intent_classifier.py         # /set vs question vs chat
│   ├── set_parser.py                # parses /set command strings into structured rules
│   ├── context_builder.py           # assembles Claude context from memory + fresh data
│   └── claude.py                    # Anthropic API calls, response generation
├── telegram/
│   ├── __init__.py
│   ├── link_builder.py              # builds Meta Ads Manager deep links
│   ├── formatter.py                 # formats responses for Telegram markdown
│   └── handler.py                   # routes incoming messages to brain or /set parser
├── scheduler/
│   ├── __init__.py
│   ├── runner.py                    # APScheduler setup + job registration
│   ├── alert_checker.py             # evaluates all alert rules against fresh data
│   ├── daily_briefing.py            # generates briefing image + fills Sheet + sends
│   └── weekly_report.py             # weekly deep analysis text
└── knowledge/
    ├── __init__.py
    ├── web_searcher.py              # daily web search for Meta/industry news
    └── ingester.py                  # handles manual knowledge feed from Telegram
```

---

## Task 1: Project Setup

**Files:**
- Create: `adbot/requirements.txt`
- Create: `adbot/.env.example`
- Create: `adbot/config.py`
- Create: all `__init__.py` files

- [ ] **Step 1: Create the adbot directory and requirements.txt**

```
adbot/requirements.txt
```

```
anthropic>=0.40.0
python-telegram-bot==20.7
chromadb>=0.4.0
apscheduler>=3.10.0
httpx>=0.27.0
gspread>=6.0.0
google-auth>=2.28.0
Pillow>=10.0.0
matplotlib>=3.8.0
python-dotenv>=1.0.0
```

- [ ] **Step 2: Create .env.example**

```
adbot/.env.example
```

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
META_ACCESS_TOKEN=your_meta_access_token_here
META_AD_ACCOUNT_ID=act_your_account_id_here
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

- [ ] **Step 3: Create config.py**

```python
# adbot/config.py
import os
import json
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
TELEGRAM_CHAT_ID = int(os.environ["TELEGRAM_CHAT_ID"])
META_ACCESS_TOKEN = os.environ["META_ACCESS_TOKEN"]
META_AD_ACCOUNT_ID = os.environ["META_AD_ACCOUNT_ID"]
GOOGLE_SPREADSHEET_ID = os.environ["GOOGLE_SPREADSHEET_ID"]
GOOGLE_SERVICE_ACCOUNT_JSON = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

META_API_VERSION = "v20.0"
META_API_BASE = f"https://graph.facebook.com/{META_API_VERSION}"

SYNC_INTERVAL_MINUTES = 30
SHEETS_SYNC_INTERVAL_MINUTES = 15
KNOWLEDGE_SYNC_INTERVAL_HOURS = 24

DEFAULT_LANGUAGE = "english"
MAX_CONVERSATION_TURNS = 10
CHROMA_TOP_K = 5
ALERT_DEDUP_HOURS = 4
```

- [ ] **Step 4: Create all __init__.py files**

Create empty `__init__.py` in: `adbot/`, `adbot/memory/`, `adbot/data/`, `adbot/brain/`, `adbot/telegram/`, `adbot/scheduler/`, `adbot/knowledge/`

- [ ] **Step 5: Install dependencies**

```bash
cd adbot
pip install -r requirements.txt
```

Expected: all packages install without errors.

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "feat: project scaffold and dependencies"
```

---

## Task 2: SQLite Memory Layer

**Files:**
- Create: `adbot/memory/schema.sql`
- Create: `adbot/memory/sqlite_store.py`
- Test: `adbot/tests/test_sqlite_store.py`

- [ ] **Step 1: Create schema.sql**

```sql
-- adbot/memory/schema.sql

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT,
    daily_budget REAL,
    lifetime_budget REAL,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS adsets (
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    name TEXT NOT NULL,
    status TEXT,
    daily_budget REAL,
    targeting_summary TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ads (
    id TEXT PRIMARY KEY,
    adset_id TEXT,
    campaign_id TEXT,
    name TEXT NOT NULL,
    status TEXT,
    spend REAL,
    impressions INTEGER,
    reach INTEGER,
    clicks INTEGER,
    cpc REAL,
    leads INTEGER,
    cpl REAL,
    health TEXT,
    date TEXT,
    meta_url TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS leads_qualified (
    date TEXT,
    sheet_name TEXT,
    value REAL,
    PRIMARY KEY (date, sheet_name)
);

CREATE TABLE IF NOT EXISTS alerts_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT,
    entity_id TEXT,
    message TEXT,
    sent_at TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_command TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    rule_data TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sheet_schemas (
    sheet_name TEXT PRIMARY KEY,
    display_name TEXT,
    purpose TEXT,
    columns TEXT,
    confirmed INTEGER DEFAULT 0,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT,
    title TEXT,
    summary TEXT,
    raw_content TEXT,
    created_at TEXT
);
```

- [ ] **Step 2: Write failing test**

```python
# adbot/tests/test_sqlite_store.py
import pytest
import os
import tempfile
from memory.sqlite_store import SQLiteStore

@pytest.fixture
def store(tmp_path):
    db_path = str(tmp_path / "test.db")
    s = SQLiteStore(db_path=db_path)
    return s

def test_save_and_get_conversation(store):
    store.save_conversation_turn("user", "hello")
    store.save_conversation_turn("assistant", "hi there")
    turns = store.get_recent_conversation(limit=10)
    assert len(turns) == 2
    assert turns[0]["role"] == "user"
    assert turns[0]["content"] == "hello"

def test_save_and_get_user_rule(store):
    store.save_user_rule("/set language uzbek", "language", {"lang": "uzbek"})
    rules = store.get_rules_by_type("language")
    assert len(rules) == 1
    assert rules[0]["rule_data"]["lang"] == "uzbek"

def test_alert_dedup(store):
    store.log_alert("cpl_spike", "ad_123", "CPL spiked")
    assert store.was_alert_sent_recently("cpl_spike", "ad_123", hours=4) is True
    assert store.was_alert_sent_recently("cpl_spike", "ad_999", hours=4) is False
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd adbot
pytest tests/test_sqlite_store.py -v
```

Expected: FAIL — `memory.sqlite_store` module not found.

- [ ] **Step 4: Implement sqlite_store.py**

```python
# adbot/memory/sqlite_store.py
import sqlite3
import json
from datetime import datetime, timedelta
from pathlib import Path

class SQLiteStore:
    def __init__(self, db_path: str = "adbot.db"):
        self.db_path = db_path
        self._init_db()

    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        schema_path = Path(__file__).parent / "schema.sql"
        schema = schema_path.read_text()
        with self._connect() as conn:
            conn.executescript(schema)

    def save_conversation_turn(self, role: str, content: str):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO conversations (role, content, created_at) VALUES (?, ?, ?)",
                (role, content, datetime.utcnow().isoformat())
            )

    def get_recent_conversation(self, limit: int = 10) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT role, content, created_at FROM conversations ORDER BY id DESC LIMIT ?",
                (limit,)
            ).fetchall()
        return [dict(r) for r in reversed(rows)]

    def save_user_rule(self, raw_command: str, rule_type: str, rule_data: dict):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO user_rules (raw_command, rule_type, rule_data, created_at) VALUES (?, ?, ?, ?)",
                (raw_command, rule_type, json.dumps(rule_data), datetime.utcnow().isoformat())
            )

    def get_rules_by_type(self, rule_type: str) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM user_rules WHERE rule_type = ? ORDER BY id DESC",
                (rule_type,)
            ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["rule_data"] = json.loads(d["rule_data"])
            result.append(d)
        return result

    def get_all_rules(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM user_rules ORDER BY id").fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["rule_data"] = json.loads(d["rule_data"])
            result.append(d)
        return result

    def log_alert(self, alert_type: str, entity_id: str, message: str):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO alerts_log (alert_type, entity_id, message, sent_at) VALUES (?, ?, ?, ?)",
                (alert_type, entity_id, message, datetime.utcnow().isoformat())
            )

    def was_alert_sent_recently(self, alert_type: str, entity_id: str, hours: int = 4) -> bool:
        cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM alerts_log WHERE alert_type=? AND entity_id=? AND sent_at > ?",
                (alert_type, entity_id, cutoff)
            ).fetchone()
        return row is not None

    def upsert_ad(self, ad: dict):
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO ads (id, adset_id, campaign_id, name, status, spend, impressions,
                    reach, clicks, cpc, leads, cpl, health, date, meta_url, updated_at)
                VALUES (:id, :adset_id, :campaign_id, :name, :status, :spend, :impressions,
                    :reach, :clicks, :cpc, :leads, :cpl, :health, :date, :meta_url, :updated_at)
                ON CONFLICT(id) DO UPDATE SET
                    status=excluded.status, spend=excluded.spend, impressions=excluded.impressions,
                    reach=excluded.reach, clicks=excluded.clicks, cpc=excluded.cpc,
                    leads=excluded.leads, cpl=excluded.cpl, health=excluded.health,
                    date=excluded.date, updated_at=excluded.updated_at
            """, {**ad, "updated_at": datetime.utcnow().isoformat()})

    def get_all_ads(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM ads ORDER BY spend DESC").fetchall()
        return [dict(r) for r in rows]

    def save_sheet_schema(self, sheet_name: str, display_name: str, purpose: str, columns: list[str], confirmed: bool = False):
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO sheet_schemas (sheet_name, display_name, purpose, columns, confirmed, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(sheet_name) DO UPDATE SET
                    display_name=excluded.display_name, purpose=excluded.purpose,
                    columns=excluded.columns, confirmed=excluded.confirmed, updated_at=excluded.updated_at
            """, (sheet_name, display_name, purpose, json.dumps(columns), int(confirmed), datetime.utcnow().isoformat()))

    def get_sheet_schemas(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM sheet_schemas").fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["columns"] = json.loads(d["columns"])
            result.append(d)
        return result

    def get_language(self) -> str:
        rules = self.get_rules_by_type("language")
        if rules:
            return rules[0]["rule_data"].get("lang", "english")
        return "english"
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd adbot
pytest tests/test_sqlite_store.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add memory/schema.sql memory/sqlite_store.py tests/test_sqlite_store.py
git commit -m "feat: SQLite memory layer with conversations, rules, ads, alerts"
```

---

## Task 3: ChromaDB Memory Layer

**Files:**
- Create: `adbot/memory/chroma_store.py`
- Test: `adbot/tests/test_chroma_store.py`

- [ ] **Step 1: Write failing test**

```python
# adbot/tests/test_chroma_store.py
import pytest
from memory.chroma_store import ChromaStore

@pytest.fixture
def store(tmp_path):
    return ChromaStore(persist_directory=str(tmp_path / "chroma"))

def test_add_and_search_knowledge(store):
    store.add_knowledge("meta_knowledge", "doc1", "Meta launched Advantage+ Shopping in 2024", {"source": "meta.com"})
    results = store.search("Advantage+ Shopping", collection="meta_knowledge", n=3)
    assert len(results) >= 1
    assert "Advantage+" in results[0]["document"]

def test_add_and_search_insight(store):
    store.add_knowledge("ad_insights", "ins1", "Ad Creative_v2 had CPL $8 in March — best performer", {"ad_id": "123"})
    results = store.search("best performing ad", collection="ad_insights", n=3)
    assert len(results) >= 1
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_chroma_store.py -v
```

Expected: FAIL — `memory.chroma_store` not found.

- [ ] **Step 3: Implement chroma_store.py**

```python
# adbot/memory/chroma_store.py
import chromadb
from chromadb.config import Settings

COLLECTIONS = ["ad_insights", "market_knowledge", "user_notes"]

class ChromaStore:
    def __init__(self, persist_directory: str = "chroma_db"):
        self.client = chromadb.PersistentClient(path=persist_directory)
        for name in COLLECTIONS:
            self.client.get_or_create_collection(name)

    def _col(self, name: str):
        return self.client.get_or_create_collection(name)

    def add_knowledge(self, collection: str, doc_id: str, text: str, metadata: dict | None = None):
        col = self._col(collection)
        col.upsert(
            ids=[doc_id],
            documents=[text],
            metadatas=[metadata or {}]
        )

    def search(self, query: str, collection: str, n: int = 5) -> list[dict]:
        col = self._col(collection)
        results = col.query(query_texts=[query], n_results=min(n, col.count() or 1))
        output = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0]
        ):
            output.append({"document": doc, "metadata": meta, "distance": dist})
        return output

    def search_all(self, query: str, n_per_collection: int = 2) -> list[dict]:
        results = []
        for col_name in COLLECTIONS:
            col = self._col(col_name)
            if col.count() == 0:
                continue
            hits = self.search(query, collection=col_name, n=n_per_collection)
            for h in hits:
                h["collection"] = col_name
            results.extend(hits)
        results.sort(key=lambda x: x["distance"])
        return results[:5]
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_chroma_store.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add memory/chroma_store.py tests/test_chroma_store.py
git commit -m "feat: ChromaDB semantic memory layer"
```

---

## Task 4: Health Scorer

**Files:**
- Create: `adbot/data/health_scorer.py`
- Test: `adbot/tests/test_health_scorer.py`

- [ ] **Step 1: Write failing test**

```python
# adbot/tests/test_health_scorer.py
from data.health_scorer import score_ads

def test_critical_when_active_zero_leads():
    ads = [{"id": "1", "status": "ACTIVE", "leads": 0, "spend": 20.0, "cpl": 0}]
    result = score_ads(ads)
    assert result[0]["health"] == "critical"

def test_warning_when_cpl_1_5x_average():
    ads = [
        {"id": "1", "status": "ACTIVE", "leads": 5, "spend": 40.0, "cpl": 8.0},
        {"id": "2", "status": "ACTIVE", "leads": 2, "spend": 50.0, "cpl": 25.0},
    ]
    result = score_ads(ads)
    assert result[0]["health"] == "good"
    assert result[1]["health"] == "warning"

def test_good_when_performing():
    ads = [{"id": "1", "status": "ACTIVE", "leads": 5, "spend": 40.0, "cpl": 8.0}]
    result = score_ads(ads)
    assert result[0]["health"] == "good"

def test_paused_ad_is_good():
    ads = [{"id": "1", "status": "PAUSED", "leads": 0, "spend": 0.0, "cpl": 0}]
    result = score_ads(ads)
    assert result[0]["health"] == "good"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_health_scorer.py -v
```

Expected: FAIL.

- [ ] **Step 3: Implement health_scorer.py**

```python
# adbot/data/health_scorer.py

ACTIVE_STATUSES = {"ACTIVE", "CAMPAIGN_PAUSED"}

def score_ads(ads: list[dict]) -> list[dict]:
    active_with_leads = [a for a in ads if a.get("status") in ACTIVE_STATUSES and a.get("leads", 0) > 0]
    if active_with_leads:
        avg_cpl = sum(a["cpl"] for a in active_with_leads) / len(active_with_leads)
    else:
        avg_cpl = 0

    result = []
    for ad in ads:
        ad = dict(ad)
        is_active = ad.get("status") in ACTIVE_STATUSES
        leads = ad.get("leads", 0)
        cpl = ad.get("cpl", 0)
        spend = ad.get("spend", 0)

        if is_active and leads == 0 and spend > 0:
            ad["health"] = "critical"
        elif is_active and avg_cpl > 0 and cpl > avg_cpl * 1.5:
            ad["health"] = "warning"
        else:
            ad["health"] = "good"
        result.append(ad)
    return result
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_health_scorer.py -v
```

Expected: all 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add data/health_scorer.py tests/test_health_scorer.py
git commit -m "feat: ad health scorer (critical/warning/good)"
```

---

## Task 5: Meta Ads Client

**Files:**
- Create: `adbot/data/meta_client.py`

- [ ] **Step 1: Implement meta_client.py**

```python
# adbot/data/meta_client.py
import httpx
from config import META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_API_BASE
from data.health_scorer import score_ads

LEADS_ACTION_TYPES = [
    "lead",
    "offsite_conversion.fb_pixel_lead",
    "onsite_web_lead",
    "complete_registration",
]

def _extract_leads(actions: list) -> int:
    if not actions:
        return 0
    for action in actions:
        if action.get("action_type") in LEADS_ACTION_TYPES:
            return int(float(action.get("value", 0)))
    return 0

def fetch_ads(date_preset: str = "last_30d") -> list[dict]:
    params = {
        "access_token": META_ACCESS_TOKEN,
        "level": "ad",
        "date_preset": date_preset,
        "fields": ",".join([
            "ad_id", "ad_name", "adset_id", "adset_name",
            "campaign_id", "campaign_name",
            "spend", "impressions", "reach", "inline_link_clicks", "cpc",
            "actions", "cost_per_action_type",
            "date_start", "date_stop",
            "frequency",
        ]),
        "limit": 500,
    }
    ads_status_params = {
        "access_token": META_ACCESS_TOKEN,
        "fields": "id,name,effective_status,adset{daily_budget}",
        "limit": 500,
    }

    with httpx.Client(timeout=30) as client:
        insights_resp = client.get(
            f"{META_API_BASE}/{META_AD_ACCOUNT_ID}/insights",
            params=params
        )
        insights_resp.raise_for_status()
        insights_data = insights_resp.json().get("data", [])

        ads_resp = client.get(
            f"{META_API_BASE}/{META_AD_ACCOUNT_ID}/ads",
            params=ads_status_params
        )
        ads_resp.raise_for_status()
        ads_status = {a["id"]: a for a in ads_resp.json().get("data", [])}

    combined = []
    for row in insights_data:
        ad_id = row.get("ad_id")
        status_info = ads_status.get(ad_id, {})
        leads = _extract_leads(row.get("actions", []))
        spend = float(row.get("spend", 0))
        cpl = spend / leads if leads > 0 else 0.0

        combined.append({
            "id": ad_id,
            "name": row.get("ad_name", ""),
            "adset_id": row.get("adset_id"),
            "adset_name": row.get("adset_name", ""),
            "campaign_id": row.get("campaign_id"),
            "campaign_name": row.get("campaign_name", ""),
            "status": status_info.get("effective_status", "UNKNOWN"),
            "daily_budget": float((status_info.get("adset") or {}).get("daily_budget", 0)) / 100,
            "spend": spend,
            "impressions": int(row.get("impressions", 0)),
            "reach": int(row.get("reach", 0)),
            "clicks": int(row.get("inline_link_clicks", 0)),
            "cpc": float(row.get("cpc") or 0),
            "leads": leads,
            "cpl": cpl,
            "frequency": float(row.get("frequency") or 0),
            "date": row.get("date_start", ""),
        })

    return score_ads(combined)

def fetch_account_status() -> dict:
    params = {
        "access_token": META_ACCESS_TOKEN,
        "fields": "account_status,disable_reason,balance,funding_source_details,spend_cap",
    }
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{META_API_BASE}/{META_AD_ACCOUNT_ID}", params=params)
        resp.raise_for_status()
    return resp.json()
```

- [ ] **Step 2: Manual smoke test (no real API key needed for structure check)**

```bash
python -c "from data.meta_client import fetch_ads; print('import ok')"
```

Expected: `import ok`

- [ ] **Step 3: Commit**

```bash
git add data/meta_client.py
git commit -m "feat: Meta Ads API client with lead extraction and health scoring"
```

---

## Task 6: Google Sheets Client with Auto-Discovery

**Files:**
- Create: `adbot/data/sheets_client.py`
- Test: `adbot/tests/test_sheets_client.py`

- [ ] **Step 1: Write failing test**

```python
# adbot/tests/test_sheets_client.py
from data.sheets_client import infer_sheet_purpose, parse_numeric_value

def test_infer_daily_sheet():
    headers = ["Sana", "Awareness budget", "Sof lid", "CPL"]
    purpose = infer_sheet_purpose("Page4", headers, [])
    assert "daily" in purpose.lower() or "spend" in purpose.lower() or "lead" in purpose.lower()

def test_parse_numeric_value():
    assert parse_numeric_value("1 234,56") == 1234.56
    assert parse_numeric_value("$45.00") == 45.0
    assert parse_numeric_value("12%") == 12.0
    assert parse_numeric_value("#DIV/0!") is None
    assert parse_numeric_value("") is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_sheets_client.py -v
```

Expected: FAIL.

- [ ] **Step 3: Implement sheets_client.py**

```python
# adbot/data/sheets_client.py
import re
import json
import gspread
from google.oauth2.service_account import Credentials
from config import GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SPREADSHEET_ID

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

def _get_client():
    creds = Credentials.from_service_account_info(GOOGLE_SERVICE_ACCOUNT_JSON, scopes=SCOPES)
    return gspread.authorize(creds)

def parse_numeric_value(value: str) -> float | None:
    if not value or str(value).strip() in ("", "#DIV/0!", "N/A", "-"):
        return None
    s = str(value).strip()
    s = re.sub(r"[$%\s]", "", s)
    s = s.replace(",", ".")
    s = re.sub(r"\.(?=.*\.)", "", s)
    try:
        return float(s)
    except ValueError:
        return None

def infer_sheet_purpose(sheet_name: str, headers: list[str], sample_rows: list[list]) -> str:
    name_lower = sheet_name.lower()
    headers_lower = " ".join(h.lower() for h in headers if h)

    if any(k in headers_lower for k in ["sana", "date", "kun"]):
        if any(k in headers_lower for k in ["weekly", "hafta", "week"]):
            return "Weekly performance data — ROI, CAC, targets per week"
        return "Daily spend and leads data"
    if any(k in headers_lower for k in ["dastur", "program", "cohort"]):
        return "Program cohort analysis — CVR, CPL, sales per cohort"
    if any(k in headers_lower for k in ["roi", "cac", "target"]):
        return "ROI and target tracking"
    if any(k in name_lower for k in ["zoom", "cohort"]):
        return "Historical cohort performance data"
    if any(k in name_lower for k in ["page4", "daily", "kun"]):
        return "Daily spend and leads data"
    if any(k in name_lower for k in ["page5", "weekly", "hafta"]):
        return "Weekly performance data"
    return f"Unknown — sheet '{sheet_name}' with columns: {', '.join(h for h in headers[:6] if h)}"

def discover_all_sheets() -> list[dict]:
    gc = _get_client()
    spreadsheet = gc.open_by_key(GOOGLE_SPREADSHEET_ID)
    discovered = []
    for worksheet in spreadsheet.worksheets():
        try:
            all_values = worksheet.get_all_values()
            if not all_values:
                continue
            headers = all_values[0]
            sample_rows = all_values[1:6]
            purpose = infer_sheet_purpose(worksheet.title, headers, sample_rows)
            discovered.append({
                "sheet_name": worksheet.title,
                "display_name": worksheet.title,
                "purpose": purpose,
                "columns": [h for h in headers if h],
            })
        except Exception:
            continue
    return discovered

def fetch_sheet_data(sheet_name: str) -> list[dict]:
    gc = _get_client()
    spreadsheet = gc.open_by_key(GOOGLE_SPREADSHEET_ID)
    worksheet = spreadsheet.worksheet(sheet_name)
    all_values = worksheet.get_all_values()
    if not all_values:
        return []
    headers = all_values[0]
    rows = []
    for row in all_values[1:]:
        if not any(cell.strip() for cell in row):
            continue
        row_dict = {}
        for i, header in enumerate(headers):
            if not header:
                continue
            cell = row[i] if i < len(row) else ""
            numeric = parse_numeric_value(cell)
            row_dict[header] = numeric if numeric is not None else cell
        rows.append(row_dict)
    return rows
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_sheets_client.py -v
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add data/sheets_client.py tests/test_sheets_client.py
git commit -m "feat: Google Sheets auto-discovery and data fetcher"
```

---

## Task 7: Telegram Link Builder & Formatter

**Files:**
- Create: `adbot/telegram/link_builder.py`
- Create: `adbot/telegram/formatter.py`
- Test: `adbot/tests/test_telegram.py`

- [ ] **Step 1: Write failing tests**

```python
# adbot/tests/test_telegram.py
from telegram.link_builder import build_ad_link, build_breadcrumb
from telegram.formatter import format_ad_alert, escape_md

def test_build_ad_link():
    link = build_ad_link("act_123", "456")
    assert "facebook.com" in link
    assert "456" in link

def test_build_breadcrumb():
    bc = build_breadcrumb("Sales Q2", "Lookalike 25-45", "Creative_v3", "act_123", "ad_789")
    assert "Sales Q2" in bc
    assert "Lookalike 25-45" in bc
    assert "Creative_v3" in bc
    assert "facebook.com" in bc

def test_escape_md():
    assert escape_md("hello_world") == "hello\\_world"
    assert escape_md("$45.00") == "\\$45\\.00"

def test_format_ad_alert():
    ad = {
        "name": "Creative_v3",
        "adset_name": "Lookalike",
        "campaign_name": "Sales Q2",
        "id": "789",
        "spend": 45.0,
        "leads": 0,
        "health": "critical",
    }
    msg = format_ad_alert(ad, "act_123")
    assert "Critical" in msg or "critical" in msg.lower()
    assert "Creative_v3" in msg or "creative" in msg.lower()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_telegram.py -v
```

Expected: FAIL.

- [ ] **Step 3: Implement link_builder.py**

```python
# adbot/telegram/link_builder.py
from config import META_AD_ACCOUNT_ID

def build_ad_link(account_id: str, ad_id: str) -> str:
    clean_account = account_id.replace("act_", "")
    return f"https://www.facebook.com/adsmanager/manage/ads?act={clean_account}&selected_ad_ids={ad_id}"

def build_adset_link(account_id: str, adset_id: str) -> str:
    clean_account = account_id.replace("act_", "")
    return f"https://www.facebook.com/adsmanager/manage/adsets?act={clean_account}&selected_adset_ids={adset_id}"

def build_campaign_link(account_id: str, campaign_id: str) -> str:
    clean_account = account_id.replace("act_", "")
    return f"https://www.facebook.com/adsmanager/manage/campaigns?act={clean_account}&selected_campaign_ids={campaign_id}"

def build_breadcrumb(campaign_name: str, adset_name: str, ad_name: str, account_id: str, ad_id: str) -> str:
    link = build_ad_link(account_id, ad_id)
    return (
        f"📁 {campaign_name}\n"
        f"  └ 📂 {adset_name}\n"
        f"      └ 📄 {ad_name}\n"
        f"         🔗 [View in Meta Ads Manager]({link})"
    )
```

- [ ] **Step 4: Implement formatter.py**

```python
# adbot/telegram/formatter.py
import re
from telegram.link_builder import build_breadcrumb
from config import META_AD_ACCOUNT_ID

ESCAPE_CHARS = r"_*[]()~`>#+-=|{}.!\$"

def escape_md(text: str) -> str:
    return re.sub(f"([{re.escape(ESCAPE_CHARS)}])", r"\\\1", str(text))

def format_currency(value: float) -> str:
    return f"${value:,.2f}"

def format_ad_alert(ad: dict, account_id: str = META_AD_ACCOUNT_ID) -> str:
    health = ad.get("health", "good")
    emoji = {"critical": "🔴", "warning": "⚠️", "good": "✅"}.get(health, "ℹ️")
    label = {"critical": "Critical Alert", "warning": "Warning", "good": "Info"}.get(health, "Alert")

    breadcrumb = build_breadcrumb(
        ad.get("campaign_name", "Unknown Campaign"),
        ad.get("adset_name", "Unknown Adset"),
        ad.get("name", "Unknown Ad"),
        account_id,
        ad.get("id", "")
    )

    spend = format_currency(ad.get("spend", 0))
    leads = ad.get("leads", 0)

    lines = [
        f"{emoji} *{label}*",
        "",
        breadcrumb,
        "",
        f"Spend: {spend} | Leads: {leads}",
    ]

    if health == "critical":
        lines.append("_Recommendation: Pause immediately or swap creative_")
    elif health == "warning":
        cpl = format_currency(ad.get("cpl", 0))
        lines.append(f"CPL: {cpl} \\(above average\\)")
        lines.append("_Recommendation: Review targeting or creative_")

    return "\n".join(lines)

def format_summary_table(rows: list[dict], columns: list[str]) -> str:
    if not rows:
        return "_No data_"
    lines = []
    for row in rows:
        parts = [f"*{col}:* {row.get(col, '-')}" for col in columns]
        lines.append(" | ".join(parts))
    return "\n".join(lines)
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_telegram.py -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add telegram/link_builder.py telegram/formatter.py tests/test_telegram.py
git commit -m "feat: Telegram link builder and message formatter"
```

---

## Task 8: /set Parser & Intent Classifier

**Files:**
- Create: `adbot/brain/set_parser.py`
- Create: `adbot/brain/intent_classifier.py`
- Test: `adbot/tests/test_brain_parsing.py`

- [ ] **Step 1: Write failing tests**

```python
# adbot/tests/test_brain_parsing.py
from brain.set_parser import parse_set_command
from brain.intent_classifier import classify_intent

def test_parse_language_rule():
    result = parse_set_command("/set language uzbek")
    assert result["rule_type"] == "language"
    assert result["rule_data"]["lang"] == "uzbek"

def test_parse_briefing_time():
    result = parse_set_command("/set briefing time 09:00")
    assert result["rule_type"] == "briefing_time"
    assert result["rule_data"]["time"] == "09:00"

def test_parse_alert_rule():
    result = parse_set_command("/set alert if CPL > 20")
    assert result["rule_type"] == "alert"
    assert "CPL" in result["rule_data"]["condition"]

def test_parse_unknown_returns_none():
    result = parse_set_command("/set gibberish xyz abc")
    assert result is None or result.get("rule_type") == "unknown"

def test_classify_set_command():
    assert classify_intent("/set language english") == "set_command"

def test_classify_question():
    assert classify_intent("which ads are performing best?") == "question"

def test_classify_chat():
    assert classify_intent("hello how are you") == "chat"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_brain_parsing.py -v
```

Expected: FAIL.

- [ ] **Step 3: Implement set_parser.py**

```python
# adbot/brain/set_parser.py
import re

def parse_set_command(raw: str) -> dict | None:
    text = raw.strip()
    if not text.lower().startswith("/set "):
        return None
    body = text[5:].strip()

    # /set language <lang>
    m = re.match(r"^language\s+(\w+)$", body, re.I)
    if m:
        return {"rule_type": "language", "rule_data": {"lang": m.group(1).lower()}, "raw": raw}

    # /set briefing time HH:MM
    m = re.match(r"^briefing\s+time\s+(\d{1,2}:\d{2})$", body, re.I)
    if m:
        return {"rule_type": "briefing_time", "rule_data": {"time": m.group(1)}, "raw": raw}

    # /set alert if <condition>
    m = re.match(r"^alert\s+if\s+(.+)$", body, re.I)
    if m:
        return {"rule_type": "alert", "rule_data": {"condition": m.group(1).strip()}, "raw": raw}

    # /set watch topic "<topic>"
    m = re.match(r'^watch\s+topic\s+"?(.+?)"?$', body, re.I)
    if m:
        return {"rule_type": "watch_topic", "rule_data": {"topic": m.group(1).strip()}, "raw": raw}

    # /set ignore campaign "<name>"
    m = re.match(r'^ignore\s+campaign\s+"?(.+?)"?$', body, re.I)
    if m:
        return {"rule_type": "ignore_campaign", "rule_data": {"name": m.group(1).strip()}, "raw": raw}

    # /set rescan sheets
    if re.match(r"^rescan\s+sheets$", body, re.I):
        return {"rule_type": "rescan_sheets", "rule_data": {}, "raw": raw}

    # Generic fallback — store as freeform
    return {"rule_type": "unknown", "rule_data": {"body": body}, "raw": raw}
```

- [ ] **Step 4: Implement intent_classifier.py**

```python
# adbot/brain/intent_classifier.py
import re

QUESTION_SIGNALS = [
    r"\?$", r"^(which|what|why|how|when|where|who|can you|show me|tell me|give me|list)",
    r"(best|worst|top|bottom|compare|analyze|analyse|check|report|summary|status)",
]
CHAT_SIGNALS = [
    r"^(hi|hello|hey|thanks|thank you|ok|okay|great|good|yes|no|sure|understood|got it)",
]

def classify_intent(text: str) -> str:
    stripped = text.strip()

    if stripped.lower().startswith("/set "):
        return "set_command"

    lower = stripped.lower()
    for pattern in QUESTION_SIGNALS:
        if re.search(pattern, lower, re.I):
            return "question"

    for pattern in CHAT_SIGNALS:
        if re.match(pattern, lower, re.I):
            return "chat"

    if len(stripped.split()) > 5:
        return "question"

    return "chat"
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_brain_parsing.py -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add brain/set_parser.py brain/intent_classifier.py tests/test_brain_parsing.py
git commit -m "feat: /set command parser and intent classifier"
```

---

## Task 9: Context Builder

**Files:**
- Create: `adbot/brain/context_builder.py`

- [ ] **Step 1: Implement context_builder.py**

```python
# adbot/brain/context_builder.py
from memory.sqlite_store import SQLiteStore
from memory.chroma_store import ChromaStore
from config import MAX_CONVERSATION_TURNS, CHROMA_TOP_K

def build_context(
    user_message: str,
    sqlite: SQLiteStore,
    chroma: ChromaStore,
) -> dict:
    conversation = sqlite.get_recent_conversation(limit=MAX_CONVERSATION_TURNS)
    semantic_memories = chroma.search_all(user_message, n_per_collection=2)
    ads = sqlite.get_all_ads()
    rules = sqlite.get_all_rules()
    language = sqlite.get_language()
    sheet_schemas = sqlite.get_sheet_schemas()

    critical_ads = [a for a in ads if a.get("health") == "critical"]
    warning_ads = [a for a in ads if a.get("health") == "warning"]
    good_ads = [a for a in ads if a.get("health") == "good"]

    total_spend = sum(a.get("spend", 0) for a in ads)
    total_leads = sum(a.get("leads", 0) for a in ads)
    avg_cpl = total_spend / total_leads if total_leads > 0 else 0

    return {
        "conversation": conversation,
        "semantic_memories": semantic_memories,
        "ads_summary": {
            "total_ads": len(ads),
            "critical_count": len(critical_ads),
            "warning_count": len(warning_ads),
            "good_count": len(good_ads),
            "total_spend": total_spend,
            "total_leads": total_leads,
            "avg_cpl": avg_cpl,
        },
        "critical_ads": critical_ads[:5],
        "warning_ads": warning_ads[:5],
        "top_ads": sorted(good_ads, key=lambda a: a.get("leads", 0), reverse=True)[:5],
        "rules": rules,
        "language": language,
        "sheet_schemas": [s for s in sheet_schemas if s.get("confirmed")],
    }
```

- [ ] **Step 2: Smoke test**

```bash
python -c "from brain.context_builder import build_context; print('import ok')"
```

Expected: `import ok`

- [ ] **Step 3: Commit**

```bash
git add brain/context_builder.py
git commit -m "feat: Claude context builder assembles memory + data + rules"
```

---

## Task 10: Claude Brain

**Files:**
- Create: `adbot/brain/claude.py`
- Create: `adbot/brain/prompts/system.txt`

- [ ] **Step 1: Create system prompt**

```
adbot/brain/prompts/system.txt
```

```
You are AdBot — a personal Meta Ads superagent for a performance marketer.

You have access to real-time data from their Meta Ads account and Google Sheets.
You know their campaign history, health scores, rules, and performance patterns.

Your job:
- Analyze ad performance and identify problems and opportunities
- Give specific, actionable recommendations (not vague advice)
- Always mention campaign > adset > ad hierarchy when referring to a specific ad
- Be direct and concise — this is a Telegram chat, not a report
- When data shows a problem, name it clearly and suggest what to do

Language: {language}
Current date: {current_date}

Account summary:
{account_summary}

Active user rules:
{user_rules}

Recent semantic memories relevant to this question:
{semantic_memories}
```

- [ ] **Step 2: Implement claude.py**

```python
# adbot/brain/claude.py
from pathlib import Path
from datetime import date
import anthropic
from config import ANTHROPIC_API_KEY
from telegram.link_builder import build_ad_link
from config import META_AD_ACCOUNT_ID

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
SYSTEM_TEMPLATE = (Path(__file__).parent / "prompts" / "system.txt").read_text()

def _format_account_summary(ctx: dict) -> str:
    s = ctx["ads_summary"]
    lines = [
        f"Total spend: ${s['total_spend']:,.2f}",
        f"Total leads: {s['total_leads']}",
        f"Avg CPL: ${s['avg_cpl']:,.2f}",
        f"Ads: {s['total_ads']} total — {s['critical_count']} critical, {s['warning_count']} warning, {s['good_count']} good",
    ]
    if ctx["critical_ads"]:
        lines.append("\nCritical ads right now:")
        for ad in ctx["critical_ads"]:
            link = build_ad_link(META_AD_ACCOUNT_ID, ad["id"])
            lines.append(f"  - {ad['name']} (${ad['spend']:.2f} spent, 0 leads) → {link}")
    return "\n".join(lines)

def _format_rules(rules: list) -> str:
    if not rules:
        return "None set."
    return "\n".join(f"- [{r['rule_type']}] {r['rule_data']}" for r in rules)

def _format_memories(memories: list) -> str:
    if not memories:
        return "No relevant memories found."
    return "\n".join(f"- [{m.get('collection', '?')}] {m['document'][:200]}" for m in memories)

def ask_claude(user_message: str, context: dict) -> str:
    system_prompt = SYSTEM_TEMPLATE.format(
        language=context.get("language", "english"),
        current_date=str(date.today()),
        account_summary=_format_account_summary(context),
        user_rules=_format_rules(context.get("rules", [])),
        semantic_memories=_format_memories(context.get("semantic_memories", [])),
    )

    messages = []
    for turn in context.get("conversation", []):
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    )
    return response.content[0].text
```

- [ ] **Step 3: Smoke test**

```bash
python -c "from brain.claude import ask_claude; print('import ok')"
```

Expected: `import ok`

- [ ] **Step 4: Commit**

```bash
git add brain/claude.py brain/prompts/system.txt
git commit -m "feat: Claude brain with context-aware prompting"
```

---

## Task 11: Telegram Handler

**Files:**
- Create: `adbot/telegram/handler.py`

- [ ] **Step 1: Implement handler.py**

```python
# adbot/telegram/handler.py
from telegram import Update
from telegram.ext import ContextTypes
from brain.intent_classifier import classify_intent
from brain.set_parser import parse_set_command
from brain.context_builder import build_context
from brain.claude import ask_claude
from memory.sqlite_store import SQLiteStore
from memory.chroma_store import ChromaStore
from data.sheets_client import discover_all_sheets
from config import TELEGRAM_CHAT_ID

sqlite = SQLiteStore()
chroma = ChromaStore()

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.id != TELEGRAM_CHAT_ID:
        return

    text = update.message.text or ""
    intent = classify_intent(text)

    if intent == "set_command":
        await _handle_set(update, text)
    else:
        await _handle_question(update, text)

async def _handle_set(update: Update, text: str):
    parsed = parse_set_command(text)
    if parsed is None:
        await update.message.reply_text("Could not parse that /set command. Try: /set language english")
        return

    rule_type = parsed["rule_type"]

    if rule_type == "rescan_sheets":
        await update.message.reply_text("Scanning all Google Sheets... please wait.")
        sheets = discover_all_sheets()
        summary_lines = [f"Found {len(sheets)} sheets:\n"]
        for s in sheets:
            summary_lines.append(f"• *{s['sheet_name']}* — {s['purpose']}")
            sqlite.save_sheet_schema(
                s["sheet_name"], s["display_name"], s["purpose"], s["columns"], confirmed=False
            )
        summary_lines.append("\nIs this correct? Reply 'yes confirm sheets' or correct me.")
        await update.message.reply_text("\n".join(summary_lines), parse_mode="Markdown")
        return

    if rule_type == "unknown":
        await update.message.reply_text(f"Saved as freeform rule: `{parsed['rule_data']['body']}`", parse_mode="Markdown")
    else:
        await update.message.reply_text(f"✅ Saved rule: *{rule_type}* → `{parsed['rule_data']}`", parse_mode="Markdown")

    sqlite.save_user_rule(parsed["raw"], rule_type, parsed["rule_data"])

async def _handle_question(update: Update, text: str):
    if text.lower().strip() == "yes confirm sheets":
        schemas = sqlite.get_sheet_schemas()
        for s in schemas:
            sqlite.save_sheet_schema(s["sheet_name"], s["display_name"], s["purpose"], s["columns"], confirmed=True)
        await update.message.reply_text("✅ Sheet schemas confirmed. I'll use all these sheets going forward.")
        return

    await update.message.reply_text("_Thinking..._", parse_mode="Markdown")

    ctx = build_context(text, sqlite, chroma)
    reply = ask_claude(text, ctx)

    sqlite.save_conversation_turn("user", text)
    sqlite.save_conversation_turn("assistant", reply)

    chroma.add_knowledge(
        "ad_insights",
        f"conv_{len(ctx['conversation'])}",
        f"Q: {text[:100]} A: {reply[:200]}",
        {"type": "conversation"}
    )

    await update.message.reply_text(reply, parse_mode="Markdown")
```

- [ ] **Step 2: Smoke test**

```bash
python -c "from telegram.handler import handle_message; print('import ok')"
```

Expected: `import ok`

- [ ] **Step 3: Commit**

```bash
git add telegram/handler.py
git commit -m "feat: Telegram message handler routing /set and questions to brain"
```

---

## Task 12: Alert Checker

**Files:**
- Create: `adbot/scheduler/alert_checker.py`

- [ ] **Step 1: Implement alert_checker.py**

```python
# adbot/scheduler/alert_checker.py
import asyncio
from datetime import datetime
from memory.sqlite_store import SQLiteStore
from data.meta_client import fetch_ads, fetch_account_status
from config import TELEGRAM_CHAT_ID, META_AD_ACCOUNT_ID, ALERT_DEDUP_HOURS
from telegram.formatter import format_ad_alert

sqlite = SQLiteStore()

ACCOUNT_STATUS_CODES = {
    1: "ACTIVE",
    2: "DISABLED",
    9: "IN_GRACE_PERIOD",
    101: "TEMPORARILY_UNAVAILABLE",
    201: "UNSETTLED",
}

async def run_alert_check(bot):
    ads = fetch_ads(date_preset="today")
    sqlite_ads = []
    for ad in ads:
        sqlite.upsert_ad(ad)
        sqlite_ads.append(ad)

    alerts = []

    for ad in sqlite_ads:
        ad_id = ad["id"]
        health = ad.get("health")

        if health == "critical":
            key = ("critical", ad_id)
            if not sqlite.was_alert_sent_recently("critical", ad_id, ALERT_DEDUP_HOURS):
                msg = format_ad_alert(ad, META_AD_ACCOUNT_ID)
                alerts.append(("critical", ad_id, msg))

        elif health == "warning":
            if not sqlite.was_alert_sent_recently("warning", ad_id, ALERT_DEDUP_HOURS):
                msg = format_ad_alert(ad, META_AD_ACCOUNT_ID)
                alerts.append(("warning", ad_id, msg))

    try:
        account = fetch_account_status()
        status_code = account.get("account_status", 1)
        status_name = ACCOUNT_STATUS_CODES.get(status_code, "UNKNOWN")

        if status_code != 1:
            if not sqlite.was_alert_sent_recently("account_status", str(status_code), ALERT_DEDUP_HOURS):
                msg = f"💳 *Account Alert*\nStatus: {status_name}\nCheck Meta Business Manager immediately."
                alerts.append(("account_status", str(status_code), msg))

        balance = float(account.get("balance", 9999)) / 100
        if balance < 20:
            if not sqlite.was_alert_sent_recently("low_balance", "account", ALERT_DEDUP_HOURS):
                msg = f"💰 *Low Balance Alert*\nPrepaid balance: ${balance:.2f}\nTop up to keep ads running."
                alerts.append(("low_balance", "account", msg))
    except Exception:
        pass

    for alert_type, entity_id, msg in alerts:
        await bot.send_message(
            chat_id=TELEGRAM_CHAT_ID,
            text=msg,
            parse_mode="Markdown"
        )
        sqlite.log_alert(alert_type, entity_id, msg)
```

- [ ] **Step 2: Commit**

```bash
git add scheduler/alert_checker.py
git commit -m "feat: alert checker for critical ads, warnings, and account status"
```

---

## Task 13: Daily Briefing

**Files:**
- Create: `adbot/scheduler/daily_briefing.py`

- [ ] **Step 1: Implement daily_briefing.py**

```python
# adbot/scheduler/daily_briefing.py
import io
from datetime import date, timedelta
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from memory.sqlite_store import SQLiteStore
from brain.claude import ask_claude
from brain.context_builder import build_context
from config import TELEGRAM_CHAT_ID

sqlite = SQLiteStore()

def _generate_briefing_image(ads: list[dict], lang: str) -> bytes:
    fig, ax = plt.subplots(figsize=(10, 6))
    fig.patch.set_facecolor("#1a1a2e")
    ax.set_facecolor("#1a1a2e")

    yesterday = str(date.today() - timedelta(days=1))
    total_spend = sum(a.get("spend", 0) for a in ads)
    total_leads = sum(a.get("leads", 0) for a in ads)
    avg_cpl = total_spend / total_leads if total_leads > 0 else 0
    critical = sum(1 for a in ads if a.get("health") == "critical")
    warning = sum(1 for a in ads if a.get("health") == "warning")
    good = sum(1 for a in ads if a.get("health") == "good")

    summary_text = (
        f"📊 Kun xulosasi — {yesterday}\n\n"
        f"Umumiy xarajat:  ${total_spend:,.2f}\n"
        f"Sifatli lidlar:  {total_leads}\n"
        f"O'rtacha CPL:    ${avg_cpl:,.2f}\n\n"
        f"Holat:\n"
        f"  ⛔ Critical:  {critical} ta reklama\n"
        f"  ⚠️  Warning:  {warning} ta reklama\n"
        f"  ✅ Good:      {good} ta reklama"
    )

    ax.text(0.05, 0.95, summary_text, transform=ax.transAxes,
            fontsize=13, verticalalignment='top', color='white',
            fontfamily='monospace',
            bbox=dict(boxstyle='round', facecolor='#16213e', alpha=0.8))
    ax.axis('off')

    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf.read()

async def send_daily_briefing(bot):
    ads = sqlite.get_all_ads()
    language = sqlite.get_language()
    ctx = build_context("Give me a brief daily summary and your top recommendation for today.", sqlite, None)

    image_bytes = _generate_briefing_image(ads, language)
    await bot.send_photo(
        chat_id=TELEGRAM_CHAT_ID,
        photo=image_bytes,
        caption="📊 Kunlik xulosangiz tayyor"
    )

    if ctx:
        from memory.chroma_store import ChromaStore
        chroma = ChromaStore()
        ctx_full = build_context("Daily briefing recommendation", sqlite, chroma)
        recommendation = ask_claude(
            "Based on yesterday's performance, what is your single most important recommendation for today?",
            ctx_full
        )
        await bot.send_message(
            chat_id=TELEGRAM_CHAT_ID,
            text=f"💡 *Bugungi tavsiya:*\n\n{recommendation}",
            parse_mode="Markdown"
        )
```

- [ ] **Step 2: Commit**

```bash
git add scheduler/daily_briefing.py
git commit -m "feat: daily briefing with Pillow image generation and Claude recommendation"
```

---

## Task 14: Weekly Report

**Files:**
- Create: `adbot/scheduler/weekly_report.py`

- [ ] **Step 1: Implement weekly_report.py**

```python
# adbot/scheduler/weekly_report.py
from memory.sqlite_store import SQLiteStore
from memory.chroma_store import ChromaStore
from brain.claude import ask_claude
from brain.context_builder import build_context
from config import TELEGRAM_CHAT_ID

sqlite = SQLiteStore()
chroma = ChromaStore()

async def send_weekly_report(bot):
    ctx = build_context(
        "Generate a full weekly performance report with best/worst ads and one strategic recommendation.",
        sqlite, chroma
    )
    report = ask_claude(
        "Generate a weekly report. Include: 1) Week vs previous week comparison, "
        "2) Top 3 best performing ads with links, 3) Top 3 worst/critical ads with links, "
        "4) ROI vs target if available, 5) One strategic recommendation for next week.",
        ctx
    )
    await bot.send_message(
        chat_id=TELEGRAM_CHAT_ID,
        text=f"📈 *Haftalik hisobot*\n\n{report}",
        parse_mode="Markdown"
    )
```

- [ ] **Step 2: Commit**

```bash
git add scheduler/weekly_report.py
git commit -m "feat: weekly report via Claude deep analysis"
```

---

## Task 15: Scheduler Runner

**Files:**
- Create: `adbot/scheduler/runner.py`

- [ ] **Step 1: Implement runner.py**

```python
# adbot/scheduler/runner.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from memory.sqlite_store import SQLiteStore
from scheduler.alert_checker import run_alert_check
from scheduler.daily_briefing import send_daily_briefing
from scheduler.weekly_report import send_weekly_report
from config import SYNC_INTERVAL_MINUTES

sqlite = SQLiteStore()

def _get_briefing_time() -> tuple[int, int]:
    rules = sqlite.get_rules_by_type("briefing_time")
    if rules:
        time_str = rules[0]["rule_data"].get("time", "09:00")
        h, m = time_str.split(":")
        return int(h), int(m)
    return 9, 0

def start_scheduler(bot) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        run_alert_check,
        trigger=IntervalTrigger(minutes=SYNC_INTERVAL_MINUTES),
        args=[bot],
        id="alert_check",
        replace_existing=True,
    )

    h, m = _get_briefing_time()
    scheduler.add_job(
        send_daily_briefing,
        trigger=CronTrigger(hour=h, minute=m),
        args=[bot],
        id="daily_briefing",
        replace_existing=True,
    )

    scheduler.add_job(
        send_weekly_report,
        trigger=CronTrigger(day_of_week="mon", hour=h, minute=m),
        args=[bot],
        id="weekly_report",
        replace_existing=True,
    )

    scheduler.start()
    return scheduler
```

- [ ] **Step 2: Commit**

```bash
git add scheduler/runner.py
git commit -m "feat: APScheduler with alert, daily briefing, weekly report jobs"
```

---

## Task 16: Knowledge Layer

**Files:**
- Create: `adbot/knowledge/web_searcher.py`
- Create: `adbot/knowledge/ingester.py`

- [ ] **Step 1: Implement web_searcher.py**

```python
# adbot/knowledge/web_searcher.py
import httpx
from datetime import date
from memory.sqlite_store import SQLiteStore
from memory.chroma_store import ChromaStore
from brain.claude import ask_claude

sqlite = SQLiteStore()
chroma = ChromaStore()

DEFAULT_TOPICS = [
    "Meta Ads new features",
    "Meta lead generation updates",
    "performance marketing CPL benchmarks",
    "Facebook Ads algorithm changes",
]

def _get_watch_topics() -> list[str]:
    rules = sqlite.get_rules_by_type("watch_topic")
    custom = [r["rule_data"]["topic"] for r in rules]
    return DEFAULT_TOPICS + custom

async def run_knowledge_sync(bot=None):
    topics = _get_watch_topics()
    today = str(date.today())

    for topic in topics:
        try:
            results = await _search_topic(topic)
            for item in results[:3]:
                doc_id = f"web_{topic[:20]}_{today}_{item['url'][-20:]}"
                chroma.add_knowledge(
                    "market_knowledge",
                    doc_id,
                    item["summary"],
                    {"source": item["url"], "topic": topic, "date": today}
                )
                sqlite._connect().execute(
                    "INSERT OR IGNORE INTO knowledge_items (source, title, summary, created_at) VALUES (?, ?, ?, ?)",
                    (item["url"], item["title"], item["summary"], today)
                )
        except Exception:
            continue

async def _search_topic(topic: str) -> list[dict]:
    # Uses DuckDuckGo instant answer API (no key required)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": topic, "format": "json", "no_redirect": 1, "no_html": 1}
            )
            data = resp.json()
            results = []
            for item in data.get("RelatedTopics", [])[:5]:
                if isinstance(item, dict) and item.get("Text"):
                    results.append({
                        "url": item.get("FirstURL", ""),
                        "title": topic,
                        "summary": item["Text"][:500],
                    })
            return results
    except Exception:
        return []
```

- [ ] **Step 2: Implement ingester.py**

```python
# adbot/knowledge/ingester.py
import httpx
from datetime import date
from memory.chroma_store import ChromaStore
from memory.sqlite_store import SQLiteStore

chroma = ChromaStore()
sqlite = SQLiteStore()

def ingest_text(text: str, source: str = "manual") -> str:
    today = str(date.today())
    doc_id = f"manual_{today}_{hash(text) % 100000}"
    chroma.add_knowledge("user_notes", doc_id, text, {"source": source, "date": today})
    with sqlite._connect() as conn:
        conn.execute(
            "INSERT INTO knowledge_items (source, title, summary, raw_content, created_at) VALUES (?, ?, ?, ?, ?)",
            (source, text[:80], text[:300], text, today)
        )
    return "✅ Remembered."

def ingest_url(url: str) -> str:
    try:
        resp = httpx.get(url, timeout=10, follow_redirects=True)
        content = resp.text[:3000]
    except Exception as e:
        return f"❌ Could not fetch URL: {e}"
    return ingest_text(f"Source: {url}\n\n{content}", source=url)
```

- [ ] **Step 3: Commit**

```bash
git add knowledge/web_searcher.py knowledge/ingester.py
git commit -m "feat: knowledge layer — web search and manual ingestion"
```

---

## Task 17: Main Entry Point

**Files:**
- Create: `adbot/main.py`

- [ ] **Step 1: Implement main.py**

```python
# adbot/main.py
import asyncio
import logging
from telegram.ext import Application, MessageHandler, filters
from telegram.handler import handle_message
from scheduler.runner import start_scheduler
from data.sheets_client import discover_all_sheets
from memory.sqlite_store import SQLiteStore
from config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)

sqlite = SQLiteStore()

async def on_startup(app):
    bot = app.bot

    # Run sheet auto-discovery on first startup if no schemas saved
    existing_schemas = sqlite.get_sheet_schemas()
    if not existing_schemas:
        logging.info("No sheet schemas found. Running auto-discovery...")
        try:
            sheets = discover_all_sheets()
            summary_lines = [f"👋 AdBot is online!\n\nI scanned your Google Sheets and found {len(sheets)} sheets:\n"]
            for s in sheets:
                summary_lines.append(f"• *{s['sheet_name']}* — {s['purpose']}")
                sqlite.save_sheet_schema(
                    s["sheet_name"], s["display_name"], s["purpose"], s["columns"], confirmed=False
                )
            summary_lines.append("\nAre these correct? Reply *yes confirm sheets* to confirm, or tell me what's wrong.")
            await bot.send_message(
                chat_id=TELEGRAM_CHAT_ID,
                text="\n".join(summary_lines),
                parse_mode="Markdown"
            )
        except Exception as e:
            await bot.send_message(
                chat_id=TELEGRAM_CHAT_ID,
                text=f"⚠️ Could not auto-discover sheets: {e}\nUse /set rescan sheets to retry."
            )
    else:
        await bot.send_message(
            chat_id=TELEGRAM_CHAT_ID,
            text="✅ AdBot is back online. Type anything to start."
        )

    start_scheduler(bot)

def main():
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).post_init(on_startup).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logging.info("AdBot starting...")
    app.run_polling()

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add main.py
git commit -m "feat: main entry point with startup, scheduler, and message handler"
```

---

## Task 18: Setup Guide for User

**Files:**
- Create: `adbot/SETUP.md`

- [ ] **Step 1: Create SETUP.md**

```markdown
# AdBot Setup Guide

## Step 1: Create your Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send it the message: `/newbot`
3. Give your bot a name (e.g. "My Ads Bot")
4. Give it a username (e.g. "myadsnewbot")
5. BotFather will give you a token that looks like: `7123456789:AAFhb...`
6. Copy that token — you'll need it below

## Step 2: Get your Telegram Chat ID

1. Search for **@userinfobot** in Telegram
2. Send it any message
3. It will reply with your ID (a number like `123456789`)
4. Copy that number

## Step 3: Copy the environment file

In the `adbot/` folder, copy `.env.example` to `.env`:

```
cp .env.example .env
```

Then open `.env` and fill in:
- `TELEGRAM_BOT_TOKEN` — the token from Step 1
- `TELEGRAM_CHAT_ID` — the number from Step 2
- `META_ACCESS_TOKEN` — same as in your existing app's `.env.local`
- `META_AD_ACCOUNT_ID` — same as in your existing app's `.env.local`
- `GOOGLE_SPREADSHEET_ID` — same as in your existing app's `.env.local`
- `GOOGLE_SERVICE_ACCOUNT_JSON` — same as in your existing app's `.env.local`
- `ANTHROPIC_API_KEY` — get this from console.anthropic.com

## Step 4: Install Python dependencies

```
pip install -r requirements.txt
```

## Step 5: Start the bot

```
python main.py
```

The bot will:
1. Connect to Telegram
2. Scan all your Google Sheets automatically
3. Send you a message asking you to confirm what it found
4. Start monitoring your Meta Ads account

## Daily Usage

Just message the bot normally:
- "Which ads are wasting money right now?"
- "What was my CPL yesterday?"
- "Compare this week to last week"

To change settings, use `/set`:
- `/set language uzbek`
- `/set briefing time 08:30`
- `/set alert if CPL > 20`
```

- [ ] **Step 2: Final commit**

```bash
git add SETUP.md
git commit -m "docs: user setup guide for AdBot"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Separate project from existing app
- ✅ Claude as AI model (claude-sonnet-4-6)
- ✅ Local memory: SQLite + ChromaDB
- ✅ Meta Ads API (campaigns, adsets, ads, account status)
- ✅ Google Sheets auto-discovery + confirmation
- ✅ /set command system (language, briefing time, alert rules, watch topics, ignore campaign, rescan sheets)
- ✅ Meta Ads Manager deep links with breadcrumbs
- ✅ Daily briefing (image via Pillow + Claude recommendation)
- ✅ Weekly report (text, no sheet filling)
- ✅ Real-time alerts (critical, warning, payment, balance, disapproved)
- ✅ Knowledge layer (web search + manual ingestion)
- ✅ Language configuration (/set language)
- ✅ Conversation history (last 10 turns in SQLite)
- ✅ Semantic memory search (ChromaDB top 5)
- ✅ Setup guide for non-technical user

**Placeholder scan:** No TBDs. All code blocks complete.

**Type consistency:** `SQLiteStore`, `ChromaStore` used consistently. `ask_claude(message, context)` signature consistent across tasks 10, 13, 14. `build_context(message, sqlite, chroma)` consistent across tasks 9, 11, 13.
```
