# Bekhruz Performance Tracker

Personal business dashboard for tracking daily KPIs across 4 projects against weekly targets.

## Stack

- **Frontend**: React (Vite) + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: Supabase (hosted Postgres)
- **Deployment**: Hetzner VPS, systemd + nginx

## Local development

### 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `server/migrations/001_initial.sql` in the Supabase SQL editor
3. Run `server/migrations/002_seed.sql` to insert seed data

### 2. Configure environment

**server/.env** — fill in your actual Supabase credentials:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3001
NODE_ENV=development
```

**client/.env** — for local dev, the Vite proxy handles /api → localhost:3001:
```
VITE_API_URL=http://localhost:3001/api
```
(The vite.config.js proxy means you can leave VITE_API_URL empty and it will work via `/api`)

### 3. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 4. Run

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Open http://localhost:5173

## Production deployment (Hetzner VPS)

### Nginx strategy

The existing app on port 80 must not be disturbed. Two options:

**Option A (recommended):** Run on port 8080 as a separate server block.
```bash
sudo cp nginx/bekhruz-tracker.conf /etc/nginx/sites-available/bekhruz-tracker
sudo ln -s /etc/nginx/sites-available/bekhruz-tracker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Option B:** Add `/tracker/` path prefix to existing port-80 server block (see comments in nginx config).

Discuss with the user before applying nginx changes — **do not overwrite port 80 config**.

### Systemd service

```bash
sudo cp server/bekhruz-tracker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable bekhruz-tracker
sudo systemctl start bekhruz-tracker
sudo systemctl status bekhruz-tracker
```

### Deploy (after initial setup)

```bash
# On the VPS
bash /home/bekhruz/tracker/deploy.sh
```

Or manually:
```bash
cd /home/bekhruz/tracker/client && npm install && npm run build
cd /home/bekhruz/tracker/server && npm install
sudo systemctl restart bekhruz-tracker
```

## Project structure

```
tracker/
├── client/                   React Vite app
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── ProjectPage.jsx
│   │   │   ├── Workshop/
│   │   │   │   ├── index.jsx
│   │   │   │   ├── DataTab.jsx
│   │   │   │   └── TargetsTab.jsx
│   │   │   └── shared/
│   │   │       ├── MetricBar.jsx
│   │   │       ├── DayChart.jsx
│   │   │       ├── HistoryTable.jsx
│   │   │       └── SparkLine.jsx
│   │   ├── hooks/
│   │   │   ├── useApi.js
│   │   │   └── usePace.js
│   │   └── utils/
│   │       └── calculations.js
│   └── vite.config.js
├── server/
│   ├── routes/
│   │   ├── projects.js
│   │   ├── periods.js
│   │   ├── metrics.js
│   │   ├── targets.js
│   │   ├── entries.js
│   │   └── dashboard.js
│   ├── migrations/
│   │   ├── 001_initial.sql
│   │   └── 002_seed.sql
│   ├── lib/supabase.js
│   └── index.js
├── nginx/bekhruz-tracker.conf
├── deploy.sh
└── README.md
```

## Calculation notes

- **Pace %**: `actual / expectedByToday × 100` where expected = `(daysElapsed / period.days) × weeklyTarget`
- **Inverse metrics** (Churn): lower is better — pace% inverted, bar color inverted
- **Numbers**: formatted with space separator (`25 000 000`), never commas
- **Active period**: auto-detected as the period whose date range contains today; falls back to most recent past period
