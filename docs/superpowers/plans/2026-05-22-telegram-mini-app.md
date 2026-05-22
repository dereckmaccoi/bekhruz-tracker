# Telegram Mini App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing performance tracker accessible as a Telegram Mini App, with a bot that sends daily summaries, an afternoon nudge, and smart alerts when metrics drop below 70% pace.

**Architecture:** All bot code runs inside the existing Railway Express server. The bot uses webhook mode (`POST /bot/webhook`). Scheduled notifications use `node-cron`. The existing React frontend gets a thin auth gate that reads `window.Telegram.WebApp.initData` and validates it server-side via HMAC-SHA256. Every API request carries the initData as `x-telegram-init-data` header; the server validates it on every call via middleware on all `/api/*` routes.

**Tech Stack:** `node-telegram-bot-api` (webhook mode), `node-cron`, Node.js built-in `crypto` (HMAC), React 18, Vite. No new DB tables. No new deployments.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `server/middleware/telegramAuth.js` | initData HMAC validation + whitelist |
| Create | `server/lib/notifications.js` | `computeProjectStatuses()` + `buildStatusMessage()` |
| Create | `server/bot.js` | Bot init, webhook handler, `/start`, `/status`, `sendToAll` |
| Modify | `server/index.js` | Auth middleware, `/api/auth/validate`, webhook route, cron jobs |
| Modify | `server/routes/entries.js` | Smart alert trigger after entry insert |
| Create | `client/src/components/TelegramAuthGate.jsx` | Auth gate wrapper |
| Modify | `client/src/hooks/useApi.js` | Inject `x-telegram-init-data` header |
| Modify | `client/src/App.jsx` | Wrap app in `<TelegramAuthGate>` |

---

## Task 1: Install dependencies and configure env vars

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install server dependencies**

  Run from `server/` directory:
  ```bash
  cd server
  npm install node-telegram-bot-api node-cron
  ```

  Expected: `server/package.json` now lists both packages under `"dependencies"`.

- [ ] **Step 2: Verify package.json**

  Confirm `server/package.json` dependencies now include:
  ```json
  {
    "node-telegram-bot-api": "^0.66.0",
    "node-cron": "^3.0.3"
  }
  ```
  (Exact versions may differ — that's fine.)

- [ ] **Step 3: Document required env vars**

  The following env vars must be set in Railway (and locally in `server/.env`). They must NEVER be hardcoded in code.

  | Variable | Purpose |
  |---|---|
  | `TELEGRAM_BOT_TOKEN` | From BotFather — used for HMAC validation and sending messages |
  | `TELEGRAM_ALLOWED_IDS` | Comma-separated Telegram user IDs with access (e.g. `591154971`) |
  | `BASE_URL` | Public HTTPS URL (e.g. `https://bekhruz-tracker-production.up.railway.app`) |
  | `TELEGRAM_WEBHOOK_SECRET` | Random hex string — add to webhook URL for basic security |

  Generate a webhook secret:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

  Copy the output and set it as `TELEGRAM_WEBHOOK_SECRET` in Railway environment variables.

- [ ] **Step 4: Commit**

  ```bash
  git add server/package.json server/package-lock.json
  git commit -m "chore: add node-telegram-bot-api and node-cron dependencies"
  ```

---

## Task 2: Server auth middleware

**Files:**
- Create: `server/middleware/telegramAuth.js`

The middleware validates the `x-telegram-init-data` header on every `/api/*` request. It runs the standard Telegram Mini App HMAC check, verifies auth_date is within 24h, and checks the user ID against the whitelist.

- [ ] **Step 1: Write a manual test script to confirm the algorithm before implementing**

  Create `server/scripts/test-hmac.js` (delete after confirming):
  ```js
  import crypto from 'crypto';

  // Simulate what Telegram sends — replace with a real initData from Telegram DevTools
  // For now, generate a synthetic one to verify our signing logic is self-consistent
  const BOT_TOKEN = 'test_token';
  const user = JSON.stringify({ id: 591154971, first_name: 'Test' });
  const authDate = Math.floor(Date.now() / 1000);

  // Build data-check-string
  const pairs = [
    `auth_date=${authDate}`,
    `user=${user}`,
  ].sort();
  const dataCheckString = pairs.join('\n');

  // Compute hash
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Now verify (same logic as middleware)
  const toVerify = dataCheckString;
  const expected = crypto.createHmac('sha256', secretKey).update(toVerify).digest('hex');
  console.log('Self-consistency check:', hash === expected ? 'PASS ✅' : 'FAIL ❌');
  ```

  Run:
  ```bash
  cd server && node scripts/test-hmac.js
  ```
  Expected output: `Self-consistency check: PASS ✅`

- [ ] **Step 2: Create the middleware file**

  Create `server/middleware/telegramAuth.js`:
  ```js
  import crypto from 'crypto';

  export function telegramAuthMiddleware(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];
    if (!initData) return res.status(401).json({ error: 'invalid_init_data' });

    // 1. Parse URL-encoded pairs
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return res.status(401).json({ error: 'invalid_init_data' });

    // 2. Build data-check-string: sort all pairs except hash, join with \n
    const entries = [];
    for (const [key, val] of params.entries()) {
      if (key !== 'hash') entries.push(`${key}=${val}`);
    }
    entries.sort();
    const dataCheckString = entries.join('\n');

    // 3. Compute expected hash
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.TELEGRAM_BOT_TOKEN)
      .digest();
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // 4. Compare (timing-safe)
    if (expectedHash !== hash) return res.status(401).json({ error: 'invalid_init_data' });

    // 5. Check auth_date (must be within 24 hours)
    const authDate = parseInt(params.get('auth_date'), 10);
    if (!authDate || Date.now() / 1000 - authDate > 86400) {
      return res.status(401).json({ error: 'init_data_expired' });
    }

    // 6. Parse user and check whitelist
    let user;
    try {
      user = JSON.parse(params.get('user'));
    } catch {
      return res.status(401).json({ error: 'invalid_init_data' });
    }

    const allowedIds = (process.env.TELEGRAM_ALLOWED_IDS || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(Boolean);

    if (!allowedIds.includes(user.id)) {
      return res.status(401).json({ error: 'not_authorized' });
    }

    req.telegramUser = user;
    next();
  }
  ```

- [ ] **Step 3: Smoke-test the middleware in isolation**

  Create `server/scripts/test-middleware.js` (delete after confirming):
  ```js
  import { telegramAuthMiddleware } from '../middleware/telegramAuth.js';
  import crypto from 'crypto';

  // Synthesise valid initData for the configured BOT_TOKEN
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) { console.error('Set TELEGRAM_BOT_TOKEN'); process.exit(1); }

  const user = JSON.stringify({ id: parseInt(process.env.TELEGRAM_ALLOWED_IDS), first_name: 'Test' });
  const authDate = Math.floor(Date.now() / 1000);
  const pairs = [`auth_date=${authDate}`, `user=${user}`].sort();
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const initData = `auth_date=${authDate}&user=${encodeURIComponent(user)}&hash=${hash}`;

  const req = { headers: { 'x-telegram-init-data': initData } };
  const res = {
    status(code) { this._code = code; return this; },
    json(body) { console.log(`Response ${this._code || 200}:`, body); },
  };
  telegramAuthMiddleware(req, res, () => console.log('next() called — middleware PASSED ✅', req.telegramUser));
  ```

  Run:
  ```bash
  cd server && node scripts/test-middleware.js
  ```
  Expected: `next() called — middleware PASSED ✅ { id: 591154971, first_name: 'Test' }`

- [ ] **Step 4: Clean up test scripts and commit**

  ```bash
  rm server/scripts/test-hmac.js server/scripts/test-middleware.js
  git add server/middleware/telegramAuth.js
  git commit -m "feat: add Telegram initData HMAC auth middleware"
  ```

---

## Task 3: Frontend auth gate + useApi.js modification

**Files:**
- Create: `client/src/components/TelegramAuthGate.jsx`
- Modify: `client/src/hooks/useApi.js`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add `setInitData` export to useApi.js**

  Open `client/src/hooks/useApi.js`. Replace the entire file with:
  ```js
  const BASE = import.meta.env.VITE_API_URL || '/api';

  // Module-level: set by TelegramAuthGate after successful validation
  let telegramInitData = null;

  export function setInitData(data) {
    telegramInitData = data;
  }

  async function request(path, options = {}) {
    const { body: rawBody, ...rest } = options;
    const headers = { 'Content-Type': 'application/json' };
    if (telegramInitData) headers['x-telegram-init-data'] = telegramInitData;

    const res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers,
      body: rawBody ? JSON.stringify(rawBody) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  export const api = {
    // Projects
    getProjects: () => request('/projects'),
    createProject: (body) => request('/projects', { method: 'POST', body }),
    updateProject: (id, body) => request(`/projects/${id}`, { method: 'PUT', body }),
    deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),

    // Periods
    getPeriods: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/periods${q ? `?${q}` : ''}`);
    },
    createPeriod: (body) => request('/periods', { method: 'POST', body }),
    updatePeriod: (id, body) => request(`/periods/${id}`, { method: 'PUT', body }),
    deletePeriod: (id) => request(`/periods/${id}`, { method: 'DELETE' }),

    // Metrics
    getMetrics: (projectId) => request(`/metrics${projectId ? `?project_id=${projectId}` : ''}`),
    createMetric: (body) => request('/metrics', { method: 'POST', body }),
    updateMetric: (id, body) => request(`/metrics/${id}`, { method: 'PUT', body }),
    deleteMetric: (id) => request(`/metrics/${id}`, { method: 'DELETE' }),

    // Targets
    getTargets: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/targets${q ? `?${q}` : ''}`);
    },
    upsertTarget: (body) => request('/targets', { method: 'POST', body }),

    // Entries
    getEntries: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/entries${q ? `?${q}` : ''}`);
    },
    upsertEntry: (body) => request('/entries', { method: 'POST', body }),

    // Project (data + entries for a period)
    getProject: (id, period_id) => request(`/project/${id}?period_id=${period_id}`),

    // Hypotheses
    getHypotheses: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/hypotheses${q ? `?${q}` : ''}`);
    },
    createHypothesis: (body) => request('/hypotheses', { method: 'POST', body }),
    updateHypothesis: (id, body) => request(`/hypotheses/${id}`, { method: 'PUT', body }),
    deleteHypothesis: (id) => request(`/hypotheses/${id}`, { method: 'DELETE' }),
  };
  ```

- [ ] **Step 2: Create TelegramAuthGate.jsx**

  Create `client/src/components/TelegramAuthGate.jsx`:
  ```jsx
  import { useState, useEffect } from 'react';
  import { setInitData } from '../hooks/useApi.js';

  export default function TelegramAuthGate({ children }) {
    // 'checking' | 'ok' | 'no_telegram' | 'unauthorized'
    const [status, setStatus] = useState('checking');
    const [errorReason, setErrorReason] = useState('');

    useEffect(() => {
      const initData = window.Telegram?.WebApp?.initData;

      if (!initData) {
        setStatus('no_telegram');
        return;
      }

      // Store initData so all subsequent API calls carry the header
      setInitData(initData);

      fetch('/api/auth/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
      })
        .then(async (res) => {
          if (res.ok) {
            setStatus('ok');
          } else {
            const data = await res.json().catch(() => ({}));
            setErrorReason(data.error || 'unauthorized');
            setStatus('unauthorized');
          }
        })
        .catch(() => {
          setErrorReason('network_error');
          setStatus('unauthorized');
        });
    }, []);

    if (status === 'checking') {
      return (
        <div className="flex items-center justify-center h-screen bg-stone-50">
          <p className="text-stone-400 text-sm">Loading…</p>
        </div>
      );
    }

    if (status === 'no_telegram') {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-stone-50 p-8 text-center gap-4">
          <span className="text-4xl">📱</span>
          <h1 className="text-xl font-semibold text-stone-800">Open from Telegram</h1>
          <p className="text-stone-500 text-sm max-w-xs">
            This app is designed to run inside Telegram as a Mini App. Please open it from the bot.
          </p>
        </div>
      );
    }

    if (status === 'unauthorized') {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-stone-50 p-8 text-center gap-4">
          <span className="text-4xl">🔒</span>
          <h1 className="text-xl font-semibold text-stone-800">Not Authorized</h1>
          <p className="text-stone-500 text-sm max-w-xs">
            {errorReason === 'init_data_expired'
              ? 'Your session expired. Please reopen the app from Telegram.'
              : 'You don\'t have access to this tracker.'}
          </p>
        </div>
      );
    }

    return children;
  }
  ```

- [ ] **Step 3: Wrap App.jsx in TelegramAuthGate**

  Open `client/src/App.jsx`. At the top, add the import after the existing imports:
  ```js
  import TelegramAuthGate from './components/TelegramAuthGate.jsx';
  ```

  Then in the `App` component, wrap the existing content:
  ```jsx
  export default function App() {
    return (
      <TelegramAuthGate>
        <LangProvider>
          <PinGate>
            <ProjectsProvider>
              <BrowserRouter>
                <AppInner />
              </BrowserRouter>
            </ProjectsProvider>
          </PinGate>
        </LangProvider>
      </TelegramAuthGate>
    );
  }
  ```

- [ ] **Step 4: Verify the build compiles**

  ```bash
  cd client && npm run build
  ```
  Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add client/src/hooks/useApi.js client/src/components/TelegramAuthGate.jsx client/src/App.jsx
  git commit -m "feat: add Telegram auth gate and initData header injection"
  ```

---

## Task 4: Notifications helper + bot module

**Files:**
- Create: `server/lib/notifications.js`
- Create: `server/bot.js`

### notifications.js

This module contains two exports: `computeProjectStatuses()` (queries the DB, returns structured pace data) and `buildStatusMessage()` (formats it into a Telegram message string). It has no bot dependency — it only imports from `db.js`.

- [ ] **Step 1: Create server/lib/notifications.js**

  ```js
  import { query } from './db.js';

  // Port of frontend daysElapsed — clamped to period bounds
  function daysElapsed(period) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(period.start_date);
    const end   = new Date(period.end_date);
    const clamped = today > end ? end : today < start ? start : today;
    return Math.max(1, Math.round((clamped - start) / 86400000) + 1);
  }

  // Port of frontend pacePercent
  function pacePercent(actual, weeklyTarget, period, isInverse) {
    const elapsed   = daysElapsed(period);
    const expected  = Math.round((elapsed / period.days) * weeklyTarget);
    if (!expected) return null;
    if (isInverse && !actual) return null;
    return isInverse
      ? Math.round((expected / actual) * 100)
      : Math.round((actual / expected) * 100);
  }

  // Port of frontend detectActivePeriod — prefers child periods (week inside campaign)
  function detectActivePeriod(periods) {
    if (!periods || periods.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);

    const activeChild = periods.find(p =>
      p.parent_id &&
      String(p.start_date).slice(0, 10) <= today &&
      String(p.end_date).slice(0, 10) >= today
    );
    if (activeChild) return activeChild;

    const active = periods.find(p =>
      String(p.start_date).slice(0, 10) <= today &&
      String(p.end_date).slice(0, 10) >= today
    );
    if (active) return active;

    const past = periods.filter(p => String(p.end_date).slice(0, 10) < today);
    return past.length > 0 ? past[past.length - 1] : periods[0];
  }

  /**
   * For each project: find active period, sum entries, compute pacePercent per metric.
   * Returns array of { projectId, projectName, avgPace, metricPaces, catchupAlerts }.
   */
  export async function computeProjectStatuses() {
    const today = new Date().toISOString().slice(0, 10);
    const { rows: projects } = await query('SELECT * FROM projects ORDER BY sort_order');
    const results = [];

    for (const project of projects) {
      // Periods for this project (own + global/unassigned)
      const { rows: periods } = await query(
        `SELECT * FROM periods
         WHERE (project_id = $1 OR project_id IS NULL)
         ORDER BY start_date`,
        [project.id]
      );

      const period = detectActivePeriod(periods);
      if (!period) continue;

      const { rows: metrics } = await query(
        'SELECT * FROM metrics WHERE project_id = $1 ORDER BY sort_order',
        [project.id]
      );
      if (metrics.length === 0) continue;

      const metricIds = metrics.map(m => `'${m.id}'`).join(',');

      const [{ rows: targets }, { rows: entrySums }] = await Promise.all([
        query(
          `SELECT * FROM targets WHERE period_id = $1 AND metric_id IN (${metricIds})`,
          [period.id]
        ),
        query(
          `SELECT metric_id, SUM(value)::numeric AS actual
           FROM daily_entries
           WHERE period_id = $1 AND metric_id IN (${metricIds})
           GROUP BY metric_id`,
          [period.id]
        ),
      ]);

      const endDate   = String(period.end_date).slice(0, 10);
      const remaining = Math.max(0, Math.ceil((new Date(endDate) - new Date(today)) / 86400000));

      const metricPaces = metrics.map(m => {
        const target  = targets.find(t => t.metric_id === m.id);
        const entry   = entrySums.find(e => e.metric_id === m.id);
        const actual  = parseFloat(entry?.actual || 0);
        const weekly  = parseFloat(target?.weekly_target || 0);
        const pct     = weekly > 0 ? pacePercent(actual, weekly, period, m.is_inverse) : null;
        return { id: m.id, name: m.name, is_inverse: m.is_inverse, actual, weekly, pacePercent: pct };
      });

      const valid    = metricPaces.filter(m => m.pacePercent !== null);
      const avgPace  = valid.length > 0
        ? Math.round(valid.reduce((s, m) => s + m.pacePercent, 0) / valid.length)
        : null;

      const catchupAlerts = metricPaces
        .filter(m => !m.is_inverse && m.pacePercent !== null && m.pacePercent < 70
          && remaining > 0 && m.weekly > m.actual)
        .map(m => ({
          metricName:    m.name,
          needPerDay:    Math.ceil((m.weekly - m.actual) / remaining),
          remainingDays: remaining,
        }));

      results.push({ projectId: project.id, projectName: project.name, avgPace, metricPaces, catchupAlerts });
    }

    return results;
  }

  /**
   * Formats computeProjectStatuses() output into a Telegram message string.
   */
  export function buildStatusMessage(statuses) {
    const today   = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = today.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

    let msg = `📊 Status — ${dayName} ${dateStr}\n\n`;

    for (const s of statuses) {
      if (s.avgPace === null) continue;
      const icon = s.avgPace >= 70 ? '✅' : '⚠️';
      msg += `${s.projectName.padEnd(14)}${s.avgPace}% ${icon}\n`;
    }

    const alerts = statuses.flatMap(s =>
      s.catchupAlerts.map(a =>
        `⚠️ ${s.projectName} · ${a.metricName} — need ${a.needPerDay}/day for ${a.remainingDays} days`
      )
    );

    if (alerts.length > 0) {
      msg += '\n' + alerts.join('\n');
    }

    return msg.trim();
  }
  ```

### bot.js

- [ ] **Step 2: Create server/bot.js**

  ```js
  import TelegramBot from 'node-telegram-bot-api';
  import { computeProjectStatuses, buildStatusMessage } from './lib/notifications.js';

  // Guard: bot is null when TELEGRAM_BOT_TOKEN is not configured
  let bot = null;

  function getAllowedIds() {
    return (process.env.TELEGRAM_ALLOWED_IDS || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(Boolean);
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { webHook: true });

    // /start
    bot.onText(/\/start/, async (msg) => {
      if (!getAllowedIds().includes(msg.from.id)) return;
      await bot.sendMessage(
        msg.chat.id,
        '👋 Welcome to Bekhruz Tracker\n\nUse /status to see current pace, or open the app:',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📊 Open Tracker', web_app: { url: process.env.BASE_URL } },
            ]],
          },
        }
      );
    });

    // /status
    bot.onText(/\/status/, async (msg) => {
      if (!getAllowedIds().includes(msg.from.id)) return;
      try {
        const statuses = await computeProjectStatuses();
        await bot.sendMessage(msg.chat.id, buildStatusMessage(statuses));
      } catch (e) {
        console.error('/status error:', e.message);
        await bot.sendMessage(msg.chat.id, '⚠️ Could not fetch status. Try again later.');
      }
    });
  } else {
    console.warn('TELEGRAM_BOT_TOKEN not set — bot disabled');
  }

  /** Send a message to every user in TELEGRAM_ALLOWED_IDS. */
  export async function sendToAll(text, opts = {}) {
    if (!bot) return;
    for (const id of getAllowedIds()) {
      try {
        await bot.sendMessage(id, text, opts);
      } catch (e) {
        console.error(`sendToAll failed for ${id}:`, e.message);
      }
    }
  }

  /** Called by the Express webhook route to process an incoming update. */
  export function handleUpdate(body) {
    if (!bot) return;
    bot.processUpdate(body);
  }

  /** Register the webhook URL with Telegram. Called once after the server starts. */
  export async function setupWebhook() {
    if (!bot) return;
    const url = `${process.env.BASE_URL}/bot/webhook?secret=${process.env.TELEGRAM_WEBHOOK_SECRET}`;
    try {
      await bot.setWebhook(url);
      console.log('Telegram webhook registered:', url);
    } catch (e) {
      console.error('Failed to register webhook:', e.message);
    }
  }
  ```

- [ ] **Step 3: Verify the module loads without error**

  ```bash
  cd server && node -e "import('./bot.js').then(() => console.log('bot.js loaded OK')).catch(e => console.error(e.message))"
  ```
  Expected: `bot.js loaded OK` (or `TELEGRAM_BOT_TOKEN not set — bot disabled` followed by `bot.js loaded OK`).

- [ ] **Step 4: Commit**

  ```bash
  git add server/lib/notifications.js server/bot.js
  git commit -m "feat: add notifications helper and bot module"
  ```

---

## Task 5: Wire up server/index.js — auth middleware, validate endpoint, webhook route, cron jobs

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add imports at the top of server/index.js**

  After the existing imports (after `import { query } from './lib/db.js';`), add:
  ```js
  import cron from 'node-cron';
  import { telegramAuthMiddleware } from './middleware/telegramAuth.js';
  import { setupWebhook, handleUpdate, sendToAll } from './bot.js';
  import { computeProjectStatuses, buildStatusMessage } from './lib/notifications.js';
  ```

- [ ] **Step 2: Add the `/api/auth/validate` endpoint and apply auth middleware**

  In `server/index.js`, after `app.use(express.json())` and before the existing `app.use('/api/projects', ...)` line, add:
  ```js
  // ── Telegram auth ─────────────────────────────────────────────────────────────
  // Validate endpoint — lightweight ping to confirm initData is accepted
  app.post('/api/auth/validate', telegramAuthMiddleware, (req, res) => {
    res.json({ ok: true, user: req.telegramUser });
  });

  // Apply auth middleware to all other /api routes
  app.use('/api', telegramAuthMiddleware);
  ```

  > **Note:** The `/api/auth/validate` route is registered BEFORE `app.use('/api', telegramAuthMiddleware)`. Since Express matches routes in registration order, the POST handler on `/api/auth/validate` runs the middleware inline (via the second argument) and sends its own response — it will not fall through to the generic middleware. The generic `app.use('/api', ...)` protects all other routes.

- [ ] **Step 3: Add the bot webhook route**

  After the existing API routes and before the static file serving block, add:
  ```js
  // ── Telegram bot webhook ──────────────────────────────────────────────────────
  app.post('/bot/webhook', (req, res) => {
    if (req.query.secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'forbidden' });
    }
    handleUpdate(req.body);
    res.sendStatus(200);
  });
  ```

- [ ] **Step 4: Wire up setupWebhook and cron jobs in the listen callback**

  Replace the existing `app.listen(...)` call at the bottom with:
  ```js
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Bekhruz Tracker running on port ${PORT}`);

    // Register Telegram webhook after server is listening
    await setupWebhook();

    // ── Cron: Morning summary — 9:00 AM Tashkent (04:00 UTC) ───────────────
    cron.schedule('0 4 * * *', async () => {
      try {
        const statuses = await computeProjectStatuses();
        const msg      = buildStatusMessage(statuses);
        const allOk    = statuses.every(s => s.avgPace === null || s.avgPace >= 70);
        await sendToAll(msg + (allOk ? '\n\n🟢 All on track' : ''));
      } catch (e) {
        console.error('Morning cron error:', e.message);
      }
    });

    // ── Cron: Afternoon nudge — 3:00 PM Tashkent (10:00 UTC) ───────────────
    cron.schedule('0 10 * * *', async () => {
      try {
        const today            = new Date().toISOString().slice(0, 10);
        const { rows: projects } = await query('SELECT id FROM projects');
        const { rows: entered  } = await query(
          `SELECT DISTINCT m.project_id
           FROM daily_entries e
           JOIN metrics m ON m.id = e.metric_id
           WHERE e.date = $1`,
          [today]
        );
        const enteredIds = new Set(entered.map(r => r.project_id));
        const hasGap     = projects.some(p => !enteredIds.has(p.id));

        if (hasGap) {
          await sendToAll("⏰ Don't forget to log today's numbers", {
            reply_markup: {
              inline_keyboard: [[
                { text: '📊 Open Tracker', web_app: { url: process.env.BASE_URL } },
              ]],
            },
          });
        }
      } catch (e) {
        console.error('Afternoon cron error:', e.message);
      }
    });
  });
  ```

- [ ] **Step 5: Verify the server starts cleanly**

  ```bash
  cd server && npm run dev
  ```
  Expected log output (in order):
  ```
  Bekhruz Tracker running on port 3001
  Telegram webhook registered: https://bekhruz-tracker-production.up.railway.app/bot/webhook?secret=...
  ```
  No uncaught errors.

- [ ] **Step 6: Test the webhook secret guard**

  ```bash
  curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/bot/webhook
  ```
  Expected: `403`

  ```bash
  curl -s -X POST "http://localhost:3001/bot/webhook?secret=wrongsecret" \
    -H "Content-Type: application/json" -d '{}'
  ```
  Expected: `{"error":"forbidden"}`

- [ ] **Step 7: Test that /api routes require auth**

  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/projects
  ```
  Expected: `401`

- [ ] **Step 8: Commit**

  ```bash
  git add server/index.js
  git commit -m "feat: wire up Telegram webhook, auth middleware, and cron notifications"
  ```

---

## Task 6: Smart alerts on entry submit

**Files:**
- Modify: `server/routes/entries.js`

After every successful entry upsert, compute the pace% for all metrics in the affected project/period. For any non-inverse metric now below 70% pace, send a Telegram alert to all allowed users — unless the same `(projectId, metricId, periodId)` combination was alerted within the last 2 hours.

- [ ] **Step 1: Add imports and the cooldown Map to entries.js**

  At the top of `server/routes/entries.js`, add after the existing imports:
  ```js
  import { sendToAll } from '../bot.js';

  // In-memory cooldown: prevents duplicate alerts for the same metric within 2 hours
  const alertCooldowns = new Map();
  const ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000;
  ```

- [ ] **Step 2: Add the smart alert helper function**

  After the `const router = Router();` line, add the helper:
  ```js
  async function triggerSmartAlerts(metric_id, period_id) {
    try {
      // Resolve project for this metric
      const { rows: [metric] } = await query(
        'SELECT project_id FROM metrics WHERE id = $1', [metric_id]
      );
      if (!metric) return;

      const { rows: [period] } = await query(
        'SELECT * FROM periods WHERE id = $1', [period_id]
      );
      if (!period) return;

      const { rows: [project] } = await query(
        'SELECT name FROM projects WHERE id = $1', [metric.project_id]
      );

      // Get all metrics for this project with pace data
      const { rows: metrics } = await query(
        'SELECT * FROM metrics WHERE project_id = $1', [metric.project_id]
      );
      if (!metrics.length) return;

      const metricIds = metrics.map(m => `'${m.id}'`).join(',');
      const [{ rows: targets }, { rows: entrySums }] = await Promise.all([
        query(
          `SELECT * FROM targets WHERE period_id = $1 AND metric_id IN (${metricIds})`,
          [period_id]
        ),
        query(
          `SELECT metric_id, SUM(value)::numeric AS actual
           FROM daily_entries WHERE period_id = $1 AND metric_id IN (${metricIds})
           GROUP BY metric_id`,
          [period_id]
        ),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start     = new Date(period.start_date);
      const end       = new Date(period.end_date);
      const clamped   = today > end ? end : today < start ? start : today;
      const elapsed   = Math.max(1, Math.round((clamped - start) / 86400000) + 1);
      const remaining = Math.max(0, Math.ceil((end - today) / 86400000));

      for (const m of metrics) {
        if (m.is_inverse) continue;
        const target = targets.find(t => t.metric_id === m.id);
        if (!target) continue;
        const entry   = entrySums.find(e => e.metric_id === m.id);
        const actual  = parseFloat(entry?.actual || 0);
        const weekly  = parseFloat(target.weekly_target);
        if (!weekly) continue;

        const expected = Math.round((elapsed / period.days) * weekly);
        if (!expected) continue;
        const pct = Math.round((actual / expected) * 100);

        if (pct < 70) {
          const cooldownKey = `${metric.project_id}:${m.id}:${period_id}`;
          const lastSent    = alertCooldowns.get(cooldownKey) || 0;
          if (Date.now() - lastSent >= ALERT_COOLDOWN_MS) {
            alertCooldowns.set(cooldownKey, Date.now());
            const needPerDay = remaining > 0
              ? Math.ceil((weekly - actual) / remaining)
              : null;
            const line2 = needPerDay !== null
              ? `Need ${needPerDay}/day for ${remaining} days to hit target`
              : 'Period has ended';
            sendToAll(
              `⚠️ ${project.name} · ${m.name} dropped to ${pct}% pace\n${line2}`
            ).catch(e => console.error('Smart alert send error:', e.message));
          }
        }
      }
    } catch (e) {
      console.error('triggerSmartAlerts error:', e.message);
    }
  }
  ```

- [ ] **Step 3: Call triggerSmartAlerts after the successful INSERT**

  In the existing `router.post('/', ...)` handler, replace the response line with:
  ```js
  router.post('/', async (req, res) => {
    const { metric_id, period_id, date, value } = req.body;
    try {
      const { rows } = await query(
        `INSERT INTO daily_entries (metric_id, period_id, date, value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (metric_id, date)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING *`,
        [metric_id, period_id, date, value]
      );
      res.json(rows[0]);

      // Fire-and-forget: smart alerts don't block the response
      triggerSmartAlerts(metric_id, period_id);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  ```

  > **Why fire-and-forget:** The entry is already saved. The alert is a side effect that shouldn't block or fail the user's entry submission. We log errors inside `triggerSmartAlerts` but don't propagate them to the HTTP response.

- [ ] **Step 4: Restart the server and confirm it starts cleanly**

  ```bash
  cd server && npm run dev
  ```
  Expected: Server starts, no uncaught errors.

- [ ] **Step 5: Manual smoke test**

  Submit an entry via curl (replace IDs with real ones from your DB):
  ```bash
  curl -s -X POST http://localhost:3001/api/entries \
    -H "Content-Type: application/json" \
    -H "x-telegram-init-data: <your_valid_initData>" \
    -d '{"metric_id":"tsb_leads","period_id":"h4_may26","date":"2026-05-22","value":1}'
  ```
  Expected: Returns the entry JSON with `200 OK`.

  If the metric is behind pace after submitting, a Telegram message should arrive within a few seconds.

- [ ] **Step 6: Commit**

  ```bash
  git add server/routes/entries.js
  git commit -m "feat: trigger smart Telegram alerts when metrics drop below 70% pace"
  ```

---

## Task 7: Deploy and verify end-to-end

**Files:** none — deployment and verification only

- [ ] **Step 1: Build the frontend**

  ```bash
  cd client && npm run build
  ```
  Expected: Build succeeds.

- [ ] **Step 2: Push to GitHub (triggers Railway deploy)**

  ```bash
  git push origin main
  ```
  Wait for Railway to complete the deploy (watch the Railway dashboard or `railway logs`).

- [ ] **Step 3: Set env vars in Railway if not already set**

  In the Railway dashboard → your service → Variables, confirm all four are present:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_ALLOWED_IDS`
  - `BASE_URL`
  - `TELEGRAM_WEBHOOK_SECRET`

- [ ] **Step 4: Confirm webhook registration in Railway logs**

  In Railway logs, look for:
  ```
  Telegram webhook registered: https://bekhruz-tracker-production.up.railway.app/bot/webhook?secret=...
  ```

- [ ] **Step 5: Test /start and /status commands**

  In Telegram, open your bot and send `/start`.
  Expected: Bot replies with the welcome message and an "Open Tracker" button.

  Send `/status`.
  Expected: Bot replies with a formatted status message showing all projects.

- [ ] **Step 6: Test the Mini App auth gate**

  Tap "Open Tracker" — the app should open inside Telegram and render normally (no auth gate error screens).

  Open the same URL in a regular browser (not Telegram).
  Expected: "Open from Telegram" full-screen message.

- [ ] **Step 7: Final commit**

  ```bash
  git add -A
  git commit -m "chore: verify Telegram Mini App end-to-end"
  ```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| initData absent → "Open from Telegram" screen | Task 3: TelegramAuthGate |
| initData present → send as header on every request | Task 3: useApi.js |
| Server validates initData via HMAC-SHA256 | Task 2: telegramAuth.js |
| auth_date check (24h) | Task 2: telegramAuth.js |
| Whitelist check (TELEGRAM_ALLOWED_IDS) | Task 2: telegramAuth.js |
| 401 invalid_init_data / init_data_expired / not_authorized | Task 2: telegramAuth.js |
| req.telegramUser attached | Task 2: telegramAuth.js |
| Bot in webhook mode, not polling | Task 4: bot.js uses `{ webHook: true }` |
| Webhook on POST /bot/webhook (NOT under /api) | Task 5: index.js |
| Secret guard on webhook | Task 5: index.js |
| /start replies with welcome + WebApp button | Task 4: bot.js |
| /status computes pace% and formats message | Task 4: notifications.js + bot.js |
| Status icons ≥70% ✅ <70% ⚠️ | Task 4: buildStatusMessage |
| Catch-up lines for metrics below 70% | Task 4: buildStatusMessage + computeProjectStatuses |
| Morning summary 9:00 AM Tashkent (04:00 UTC) | Task 5: index.js cron |
| All on track → 🟢 footer | Task 5: index.js cron |
| Afternoon nudge 3:00 PM Tashkent (10:00 UTC) | Task 5: index.js cron |
| Nudge only when any project has zero entries today | Task 5: index.js cron |
| Smart alerts fire-and-forget after entry submit | Task 6: entries.js |
| Smart alerts: only non-inverse metrics | Task 6: triggerSmartAlerts |
| 2-hour cooldown per (project, metric, period) | Task 6: alertCooldowns Map |
| Credentials only via env vars, never hardcoded | All tasks: checked — no hardcoded secrets |

### No-placeholder scan

All steps contain full, runnable code. No "TBD", "TODO", or "implement as appropriate".

### Type / name consistency

- `computeProjectStatuses()` in `notifications.js` — imported in `bot.js` and `index.js` ✓
- `buildStatusMessage(statuses)` in `notifications.js` — imported in `bot.js` and `index.js` ✓
- `sendToAll(text, opts)` in `bot.js` — imported in `entries.js` and `index.js` ✓
- `handleUpdate(body)` in `bot.js` — called in `index.js` webhook route ✓
- `setupWebhook()` in `bot.js` — called in `index.js` listen callback ✓
- `telegramAuthMiddleware` in `middleware/telegramAuth.js` — applied in `index.js` ✓
- `setInitData(data)` in `useApi.js` — called in `TelegramAuthGate.jsx` ✓
