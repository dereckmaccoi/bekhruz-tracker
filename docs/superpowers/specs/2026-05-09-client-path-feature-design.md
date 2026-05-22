# Client Path Feature — Design Spec
**Date:** 2026-05-09  
**App:** Marketing Dashboard (React + FastAPI, deployed on Hetzner)

---

## Context

The marketing dashboard already shows Meta Ads performance (campaigns, ad sets, creatives, spend). This feature adds the **bottom of the funnel** — connecting each ad/lead to what actually happened: was the lead called? Did they answer? Did they buy?

Currently that connection does not exist in the app. Managers work in Google Sheets manually. This feature bridges Meta Ads API data with the Google Sheet data to give a full client journey view.

---

## Lead Sources

| Source | Campaign Data | How it arrives |
|---|---|---|
| Meta — Target campaign | ✅ ad name, adset, campaign | Meta Lead Ads API |
| Meta — Milliard campaign | ✅ ad name, adset, campaign | Meta Lead Ads API |
| Tilda landing page | ❌ no UTM yet (coming soon) | Tilda webhook |

All leads end up in the same Google Sheet ("Leadlar" tab).  
UTM parameters will be added to Tilda forms in the future — the design should handle this gracefully when that happens.

---

## Current Manual Flow (DO NOT change this)

1. Leads arrive in Meta and Tilda
2. Once per day, someone manually exports/reviews leads
3. Junk leads are filtered out (wrong numbers, incomplete forms, fun fillers)
4. Valid leads are written into the Google Sheet with manager assignment
5. Managers call from the sheet, log call results there

The manual daily distribution step stays as-is. The app only **reads** this data — it does not replace the sheet workflow.

---

## What to Build

### Feature 1 — Lead Quality Rate (Daily Filter Stats)

Show daily how many leads were received vs. how many made it through the filter to managers.

**Data logic:**
```
TOTAL RECEIVED  = Meta API lead count (per day) + Tilda webhook log count (per day)
DISTRIBUTED     = rows in Google Sheet for that day (assigned to managers)
FILTERED OUT    = TOTAL RECEIVED - DISTRIBUTED
QUALITY RATE %  = DISTRIBUTED / TOTAL RECEIVED × 100
```

**Requirements:**
- Backend must log ALL Tilda webhook submissions (even junk ones) with just: `timestamp`, `source: "tilda"`, `phone_hash or raw` — no need to store reason
- Meta API already gives total lead count per day per campaign — use that
- Display as a daily card/chart — filterable by date range

**UI sketch:**
```
📅 May 7
━━━━━━━━━━━━━━━━━━━━━━━━
Total received    24
Distributed       17   ██████████████░░░░  71%
Filtered out       7                        29%
━━━━━━━━━━━━━━━━━━━━━━━━
  Meta Target     18 → 14 valid  (78%)
  Meta Milliard    3 →  2 valid  (67%)
  Tilda            3 →  1 valid  (33%)
```

---

### Feature 2 — Funnel View (Aggregate)

Show the full conversion funnel from lead to sale, filterable by date range, manager, campaign/source.

**Funnel stages:**
```
LEADS RECEIVED
      ↓  % distributed
LEADS DISTRIBUTED (to managers)
      ↓  % called same day
FIRST CALL MADE
      ↓  % answered
CONTACTED
      ↓  % qualified
QUALIFIED
      ↓  % closed
SOLD
```

Each stage: show count + conversion % from previous stage.

**Filters:** date range, campaign, source (Meta Target / Meta Milliard / Tilda), manager

---

### Feature 3 — Creative Performance Table

Show each ad creative's performance across the full funnel, not just cost-per-lead.

| Ad Name | Leads | Contacted | Sold | CPL | Cost/Sale |
|---|---|---|---|---|---|
| Video_A | 32 | 19 | 4 | $3.2 | $25 |
| Video_B | 14 | 3 | 0 | $5.1 | — |
| Tilda (no UTM) | 9 | 6 | 2 | — | — |

- CPL and spend come from Meta Ads API (already connected)
- Contacted / Sold counts come from Google Sheet
- Tilda row shows no CPL until UTM is added
- Clicking a row drills into individual leads from that creative

---

### Feature 4 — Individual Lead Timeline

Clicking any lead opens its full journey:

```
📹 Ad: "Video_A"  |  Campaign: SKV May  |  Adset: 25-35 Toshkent
📋 Submitted: May 4, 15:10  [Meta]
👤 Assigned: Ситора Тойчиева
📞 Call #1: May 4, 15:54 — No answer  (+44 min delay)
📞 Call #2: May 4, 17:20 — 7 min talk ✅
🎯 Status: Qualified
💰 Sale: —
```

**Fields shown:**
- Source (Meta/Tilda) + ad name / adset / campaign (if available)
- Form submission timestamp
- Assigned manager
- Each call attempt: time, outcome (answered/not), talk duration
- Contact delay (time between form submit and first answered call)
- Current status + sale amount if sold

---

## Data Architecture

### Join Key
**Phone number** is the link between Meta/Tilda lead data and the Google Sheet call/sale data.

> ⚠️ Edge case: same phone number submitting twice from different ads. Handle by showing both entries, flagging as potential duplicate.

### Google Sheet Columns Used (Leadlar tab)

| Column | Used for |
|---|---|
| type | Source label (Target / Milliard) |
| Ad name | Creative attribution |
| Adset name | Adset attribution |
| Campaign name | Campaign attribution |
| Crmga tushgan sanasi | Lead entry date |
| Менежерлар | Assigned manager |
| Тел | Phone (join key) |
| Қўнғироқлар сони | Total calls |
| Ижобий қўнғироқлар | Answered calls |
| Жами гаплашилган дақиқа | Total talk time |
| Leadga aloqaga chiqgan vaqti | First contact time |
| Qancha kech aloqaga chiqgan | Contact delay (minutes) |
| Sotuv sana | Sale date |
| Sotgan manager | Selling manager |
| Sotuv summa | Sale amount |

### New Backend Requirements

1. **Tilda webhook endpoint** — `POST /api/webhooks/tilda`
   - Log every submission with: timestamp, raw phone, source="tilda"
   - Used only for counting total received (quality rate denominator)

2. **Google Sheet sync** — read Leadlar tab on demand (or on schedule)
   - Already partially built via `sync.py` — extend to cover Leadlar tab

3. **Meta leads pull** — `GET /leadgen_forms/{form_id}/leads`
   - Pull daily lead count per form/campaign for quality rate numerator

---

## UI Placement

New page in the existing app: **"Klientlar"** (or "Leads" / "Client Path")  
Sits alongside: Campaigns, Ad Sets, Creatives, Dashboard, Daily Log

---

## Out of Scope (for now)

- Changing the manual daily distribution workflow
- Replacing Google Sheets for managers
- Tracking rejection reasons for filtered leads
- Real-time manager notifications
- Auto-assignment of leads

---

## Future / When Tilda UTM is Added

- Tilda leads will automatically get campaign/adset/ad attribution
- The "Tilda (no UTM)" row in creative table splits into real campaign rows
- No structural changes needed — just starts populating empty attribution fields
