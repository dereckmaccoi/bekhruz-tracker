# Meta Ads Telegram Superagent — Design Spec
**Date:** 2026-04-14  
**Status:** Approved  

---

## Overview

A standalone Telegram bot that acts as a personal Meta Ads superagent. It connects directly to the user's Meta Ads account and Google Sheets, maintains a persistent local memory, converses in natural language, sends proactive alerts, and delivers daily/weekly automated briefings. It replaces the existing Next.js dashboard app entirely.

**Not in scope (v1):** Direct actions on Meta account (pause ads, change budgets). Analysis and recommendations only.

---

## Tech Stack

| Component | Technology |
|---|---|
| Language | Python 3.11 |
| Telegram interface | python-telegram-bot |
| AI brain | Anthropic Claude (claude-sonnet-4-6) |
| Structured memory | SQLite (built-in, zero setup) |
| Semantic memory | ChromaDB (local, pip install) |
| Scheduling | APScheduler |
| HTTP client | httpx |
| Google Sheets | gspread |
| Meta Ads | Meta Graph API v20.0 |
| Image generation | Pillow / matplotlib (daily briefing image) |

Runs fully local on user's PC. No cloud database. No Docker required.

---

## Project Structure

```
adbot/
├── main.py                  # entry point, wires everything together
├── config.py                # env vars, constants, user-set rules loader
├── telegram/
│   ├── handler.py           # incoming message routing
│   ├── formatter.py         # response formatting, Telegram markdown
│   └── link_builder.py      # Meta Ads Manager deep links
├── brain/
│   ├── claude.py            # Anthropic API calls
│   ├── context_builder.py   # assembles context for each prompt
│   ├── intent_classifier.py # /set vs question vs chat
│   └── prompts/             # system prompts, briefing templates
├── memory/
│   ├── sqlite_store.py      # structured data (campaigns, ads, rules, conversations)
│   ├── chroma_store.py      # semantic memory (insights, knowledge, notes)
│   └── schema.sql           # SQLite table definitions
├── data/
│   ├── meta_client.py       # Meta Graph API fetcher
│   ├── sheets_client.py     # Google Sheets fetcher + auto-discovery
│   └── health_scorer.py     # Critical / Warning / Good logic
├── scheduler/
│   ├── runner.py            # APScheduler setup
│   ├── alert_checker.py     # evaluates all alert rules against fresh data
│   ├── daily_briefing.py    # fills Sheet template + exports image + sends
│   └── weekly_report.py     # deep weekly analysis, text + links
└── knowledge/
    ├── web_searcher.py      # scheduled web search for Meta/industry news
    └── ingester.py          # manual feed handler (URLs, text, images)
```

---

## Architecture & Data Flow

```
[Meta Ads API] ──┐
                 ├──► [data/] ──► [memory/sqlite] ──► [brain/claude] ──► [telegram/]
[Google Sheets] ─┘         └──► [memory/chroma]  ──►        ▲               │
                                                              │               ▼
[Web Search] ──► [knowledge/] ──► [memory/chroma] ──►    You (Telegram)
                                                              ▲
                                                    [scheduler/] (alerts, briefings)
```

**Sync cycle (every 30 min):**
1. Fetch Meta Ads (campaign + adset + ad level)
2. Fetch all Google Sheets
3. Write raw numbers → SQLite
4. Detect changes vs last snapshot
5. Generate insight summaries → ChromaDB
6. Run alert checker → send Telegram alerts if triggered

---

## Memory System

### SQLite — Structured Storage

| Table | Purpose |
|---|---|
| `campaigns` | Campaign name, status, budget, daily snapshots |
| `adsets` | Adset name, targeting summary, CPL, leads per day |
| `ads` | Ad name, creative, spend, CPL, leads, health, date |
| `leads_qualified` | Filtered lead counts from Google Sheets |
| `alerts_log` | History of sent alerts (deduplication) |
| `conversations` | Last N message turns per user (Claude context) |
| `user_rules` | All `/set` commands saved as rules |
| `knowledge_items` | Manually ingested articles/notes metadata |
| `sheet_schemas` | Discovered Google Sheet structures + user-confirmed mappings |

### ChromaDB — Semantic Memory

| Collection | Purpose |
|---|---|
| `ad_insights` | Summarized performance observations over time |
| `market_knowledge` | Web-fetched articles, Meta announcements, trends |
| `user_notes` | Manually fed knowledge (text, URLs, image descriptions) |

**How both layers combine per request:**
1. SQLite → fresh structured data snapshot
2. ChromaDB → top-K semantically relevant memories
3. SQLite → last 10 conversation turns
4. SQLite → all active user rules
5. All assembled into Claude's context window

---

## Data Layer

### Meta Ads API
- Endpoint: Meta Graph API v20.0
- Auth: `META_ACCESS_TOKEN` env var
- Account: `META_AD_ACCOUNT_ID` env var
- Fetch levels: campaign → adset → ad
- Metrics: spend, impressions, reach, clicks, CPC, leads, CPL, status, daily_budget, frequency
- Lead extraction: checks `lead`, `offsite_conversion.fb_pixel_lead`, `onsite_web_lead` action types
- Also fetches: account status, payment method status, prepaid balance

**Health scoring:**
- Critical: active ad + $0 qualified leads
- Warning: active ad + CPL > 1.5x account average
- Good: all others

### Google Sheets — Auto-Discovery

On first run (and on `/set rescan sheets`):
1. Fetch list of all sheets in the spreadsheet
2. Read headers + first 10 rows of each sheet
3. Claude analyzes structure — infers purpose, column meanings, data types
4. Bot sends confirmation message to Telegram: "I found 6 sheets. Here's what I think each one is: [list]. Is this correct?"
5. User confirms or corrects
6. Schema saved to `sheet_schemas` SQLite table

On subsequent fetches: reads all confirmed sheets. If schema mismatch detected (new/renamed columns) → sends alert asking user to re-confirm.

---

## Brain (Claude)

### Per-message pipeline

```
Incoming message
      │
      ▼
Intent classifier
      ├── /set command → parse rule → confirm → save to SQLite
      └── question/chat →
               │
               ▼
          Context builder assembles:
          - Last 10 turns (SQLite)
          - Top 5 semantic memories (ChromaDB, configurable)
          - Fresh data snapshot (SQLite)
          - Active user rules (SQLite)
          - Current date + period
               │
               ▼
          Claude API call
               │
               ▼
          Response formatter:
          - Language: user's configured language (/set language)
          - Ad references: always include campaign → adset → ad + 🔗 link
          - Data tables: Telegram-formatted markdown
```

### Meta Ads Manager deep links

Every mention of a specific ad, adset, or campaign includes a breadcrumb and a clickable link:

```
Campaign: Sales Q2
  └ Adset: Lookalike 25-45
      └ Ad: Creative_Summer_v3
         🔗 View in Meta Ads Manager
```

Links are constructed from entity IDs returned by the Meta API.

### Language

Configurable via `/set language [english|russian|uzbek|auto]`.  
Default: English.  
`auto` mode matches the language the user writes in.

---

## /set Command System

`/set` commands are strictly separated from normal conversation. Claude never interprets a regular message as a configuration change — only explicit `/set` prefix triggers rule storage.

**Examples:**
```
/set language uzbek
/set briefing time 09:00
/set alert if CPL > 15
/set alert if spend > 500 per day
/set flag CPL over 20 as critical
/set ignore campaign "Awareness" in briefings
/set qualified leads column is "Sof lid"
/set watch topic "Meta Advantage+ updates"
/set rescan sheets
```

Rules stored in `user_rules` SQLite table. Applied automatically to all Claude context builds and alert checks.

---

## Scheduler

### 1. Real-time Alerts (checks every 30 min with data sync)

**Built-in triggers:**

| Trigger | Message |
|---|---|
| Ad Critical (spend + 0 leads) | 🔴 Ad X burning budget — $N spent, 0 leads |
| CPL spike >50% vs yesterday | ⚠️ CPL jumped from $X to $Y on Adset Z |
| Daily budget >80% before 3pm | ⚠️ Campaign X has used 83% of daily budget |
| Qualified leads drop >30% vs same day last week | 📉 Leads down 40% vs last Tuesday |
| Ad disapproved | 🚫 Ad X disapproved — policy violation |
| New ad active | 🟢 New ad launched: Creative_v4 |
| Campaign budget exhausted | 💸 Campaign budget 95% used |
| High frequency (>3) | 😴 Ad X frequency >3 — audience saturating |
| CTR drops >40% | 📉 CTR fell 60% on Ad Y vs last week |
| Active ad with $0 spend | ❓ Active ad not delivering — possible issue |
| Payment method failed | 💳 Payment issue — ads may stop running |
| Account in grace period | ⚠️ Account in grace period — resolve payment |
| Account disabled | 🚫 Ad account disabled |
| Prepaid balance low (<$20 or custom) | 💰 Prepaid balance low — top up |

Custom triggers added via `/set alert if [condition]`.

Alert deduplication: same alert not re-sent within 4 hours (configurable).

### 2. Daily Briefing (time configurable via `/set briefing time HH:MM`)

1. Bot writes yesterday's data into a designated Google Sheet template (auto-created on first run if not exists)
2. Generates a styled image locally using Pillow/matplotlib (clean table card layout) from the same data
3. Sends image to Telegram
4. Follows with a short text block: Claude's recommendation for the day

### 3. Weekly Report (every Monday, time configurable)

Deep text analysis — no sheet filling:
- Week vs previous week comparison
- Best and worst ads with links
- ROI vs target (from Google Sheets)
- One strategic recommendation

---

## Knowledge Layer

### Scheduled Web Search (daily)

Bot searches for fresh content and stores summaries in ChromaDB `market_knowledge`:
- Meta for Business blog
- Meta Ads changelog / developer news
- Industry performance marketing sources

Default watch topics (expandable via `/set watch topic "..."`):
- "Meta Ads new features"
- "Meta lead generation updates"
- "performance marketing CPL benchmarks"

If major relevant news found → sends Telegram notification.

### Manual Ingestion

User sends to Telegram chat:
- A URL + "remember this" → bot fetches, summarizes, stores in ChromaDB
- Plain text + "remember this" → stored directly
- Image/screenshot + "remember this" → Claude describes + stores text summary

Stored in both `knowledge_items` (SQLite metadata) and `market_knowledge` (ChromaDB).

---

## Configuration (`.env`)

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=
GOOGLE_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=
ANTHROPIC_API_KEY=
```

---

## Out of Scope (v1)

- Direct Meta API actions (pause ads, change budgets, duplicate ads) — v2
- Multi-user support — single user only
- Web UI — Telegram is the only interface
- VPS deployment — local PC only for now
