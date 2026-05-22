# Telegram Mini App — Design Spec

**Date:** 2026-05-22  
**Status:** Approved

## Goal

Make the performance tracker accessible from Telegram: the existing web app opens as a Mini App inside Telegram, a bot sends daily summaries and smart alerts, and users can check current pace with `/status`.

## Architecture

All bot and notification code lives inside the **existing Railway Express server** — no new services, no new deployments. The bot uses webhook mode (Telegram pushes updates to `POST /bot/webhook`). Scheduled notifications use `node-cron`. Smart alerts fire from the entries route. The existing React frontend gets a thin Telegram auth gate.

Everything shares the same PostgreSQL database and the same `query()` helper.

---

## Part 1: Mini App Auth Gate

### How it works

Every page load, the frontend reads `window.Telegram?.WebApp?.initData`. This string is injected by Telegram when the app is opened as a Mini App — it contains the user's Telegram ID, name, and a cryptographic hash.

- **If initData is absent** (direct browser URL): show a full-screen "Please open this app from Telegram" message with a link to the bot. The app does not load.
- **If initData is present**: include it as `x-telegram-init-data` header on every API request. The server validates it on every call.
- **If server returns 401**: show "You're not authorized" screen.
- **If server returns 200**: render the full app normally.

### Server-side validation (middleware)

`server/middleware/telegramAuth.js` runs on all `/api/*` routes.

**Algorithm** (standard Telegram Mini App validation):
1. Parse the `x-telegram-init-data` header as URL-encoded key=value pairs.
2. Extract `hash` from the pairs. Remove it from the set.
3. Sort remaining pairs alphabetically, join as `key=value\n...` (newline-separated).
4. Compute `HMAC-SHA256` of that string using `HMAC-SHA256("WebAppData", BOT_TOKEN)` as the key.
5. Compare with the extracted `hash`. If mismatch → 401 `{ error: 'invalid_init_data' }`.
6. Check `auth_date` field: if older than 24 hours → 401 `{ error: 'init_data_expired' }`.
7. Parse `user` field (JSON). Check `user.id` against `TELEGRAM_ALLOWED_IDS` env var (comma-separated integers). If not in list → 401 `{ error: 'not_authorized' }`.
8. Attach `req.telegramUser` = parsed user object. Call `next()`.

Applied in `server/index.js` as `app.use('/api', telegramAuthMiddleware)`.

### Frontend components

**`client/src/components/TelegramAuthGate.jsx`**

Wraps the entire app. On mount:
1. Reads `window.Telegram?.WebApp?.initData`.
2. If absent → render "Open from Telegram" screen (full-page, no spinner).
3. If present → call `POST /api/auth/validate` (a lightweight endpoint that just runs the middleware and returns 200 or 401). Show spinner while waiting.
4. On 200 → store initData in module-level variable, render `{children}`.
5. On 401 → render "Not authorized" screen with the error reason.

**`client/src/hooks/useApi.js`**

The existing `request()` function gains one addition: if a module-level `telegramInitData` variable is set, include `'x-telegram-init-data': telegramInitData` in every fetch headers object. `TelegramAuthGate` sets this variable on successful validation.

### New env vars

| Variable | Example | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `7123456789:AAF...` | From BotFather — used for HMAC validation and sending messages |
| `TELEGRAM_ALLOWED_IDS` | `123456789,987654321` | Comma-separated Telegram user IDs with access |
| `BASE_URL` | `https://bekhruz-tracker.up.railway.app` | Used to set the webhook URL on startup |
| `TELEGRAM_WEBHOOK_SECRET` | `random-hex-string` | Appended to webhook URL for basic security |

---

## Part 2: Bot Commands and Webhook

### Setup

On server startup (`server/index.js`), after Express is listening, call:
```
bot.setWebhook(`${BASE_URL}/bot/webhook?secret=${TELEGRAM_WEBHOOK_SECRET}`)
```

The webhook route (`POST /bot/webhook`) is **excluded** from the Telegram auth middleware (it's not under `/api`). It validates the `secret` query param before processing.

Package: `node-telegram-bot-api` in webhook mode.

### `/start` command

Replies to any user in `TELEGRAM_ALLOWED_IDS`. Sends:

```
👋 Welcome to Bekhruz Tracker

Use /status to see current pace, or open the app:
```

With an inline keyboard containing one button of type `web_app` pointing to `BASE_URL`.

Ignores messages from users not in the whitelist (no reply).

### `/status` command

Queries the DB to compute current pace% for all projects. For each project:
1. Find the active period (same `detectActivePeriod` logic as frontend).
2. Sum entries for that period per metric.
3. Compute `pacePercent` for each metric with a target.
4. Average across metrics → project-level pace%.

Sends a formatted message:

```
📊 Status — Mon 22 May

TSB          78% ✅
FC · Sotuv   61% ⚠️
MC           92% ✅

⚠️ FC · Leads — need 45/day for 3 days
```

Status icons: ≥70% → ✅, <70% → ⚠️. Catch-up lines only for metrics below 70% with days remaining.

---

## Part 3: Notifications

All notifications send to every user ID in `TELEGRAM_ALLOWED_IDS` via `bot.sendMessage(userId, text, opts)`.

Shared formatting lives in `server/lib/notifications.js` — exports `buildStatusMessage(projectSummaries)` used by both `/status` and the morning cron.

### Morning summary — 9:00 AM Tashkent (04:00 UTC)

Cron: `0 4 * * *`

Runs the same status query as `/status`. Sends to all allowed users. If all projects ≥70% pace → adds `🟢 All on track` footer. If any behind → lists catch-up math.

### Afternoon nudge — 3:00 PM Tashkent (10:00 UTC)

Cron: `0 10 * * *`

Checks whether any project has zero entries for today (queries `daily_entries WHERE date = TODAY`). If yes → sends:

```
⏰ Don't forget to log today's numbers
```

With the "Open Tracker" WebApp button. If all projects already have today's entries → sends nothing.

### Smart alerts — triggered on entry submit

In `server/routes/entries.js`, after a new entry row is inserted:

1. Fetch all metrics and targets for the project.
2. Compute `pacePercent` for each metric in the current period.
3. For each non-inverse metric now below 70%: send alert to all allowed users.

To avoid spam, track `lastAlertSent` per `(project_id, metric_id, period_id)` in an in-memory Map. Only send if no alert was sent in the last 2 hours for that combination.

Alert message:
```
⚠️ TSB · Leads dropped to 58% pace
Need 45/day for 3 days to hit target
```

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Create | `server/bot.js` | Bot init, webhook handler, `/start`, `/status` |
| Create | `server/lib/notifications.js` | `buildStatusMessage()` formatting helper |
| Create | `server/middleware/telegramAuth.js` | initData HMAC validation + whitelist check |
| Modify | `server/index.js` | Import bot, add webhook route, start cron jobs, apply auth middleware |
| Modify | `server/routes/entries.js` | Post-insert smart alert trigger |
| Create | `client/src/components/TelegramAuthGate.jsx` | Auth gate wrapper component |
| Modify | `client/src/hooks/useApi.js` | Inject `x-telegram-init-data` header |
| Modify | `client/src/App.jsx` | Wrap app in `<TelegramAuthGate>` |

---

## Out of Scope

- `/log` command (quick entry via chat) — deferred
- Per-user notification preferences — all allowed users get all notifications
- Message editing / deleting old status messages
- Telegram auth for the Railway admin panel
- Multi-language bot messages (bot sends in English only)
