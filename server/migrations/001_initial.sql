-- Projects
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Periods (fully user-managed, not hardcoded)
CREATE TABLE periods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Metrics (per project, user can add/edit/delete)
CREATE TABLE metrics (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('daily', 'weekly', 'inverse')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Targets (per metric per period)
CREATE TABLE targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id TEXT REFERENCES metrics(id) ON DELETE CASCADE,
  period_id TEXT REFERENCES periods(id) ON DELETE CASCADE,
  weekly_target NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(metric_id, period_id)
);

-- Daily entries
CREATE TABLE daily_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id TEXT REFERENCES metrics(id) ON DELETE CASCADE,
  period_id TEXT REFERENCES periods(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(metric_id, date)
);

-- Indexes for common queries
CREATE INDEX idx_entries_metric_date ON daily_entries(metric_id, date);
CREATE INDEX idx_entries_period ON daily_entries(period_id);
CREATE INDEX idx_targets_metric_period ON targets(metric_id, period_id);
CREATE INDEX idx_metrics_project ON metrics(project_id);
