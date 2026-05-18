-- Projects
INSERT INTO projects (id, name, color, sort_order) VALUES
  ('tsb', 'TSB', '#E24B4A', 1),
  ('fc', 'Full Contact', '#1D9E75', 2),
  ('mc', 'Milliard Club', '#7F77DD', 3),
  ('sd', 'Sales Doctor', '#BA7517', 4);

-- Periods (May 2026)
INSERT INTO periods (id, name, start_date, end_date) VALUES
  ('h1_may26', 'H1', '2026-05-01', '2026-05-07'),
  ('h2_may26', 'H2', '2026-05-08', '2026-05-15'),
  ('h3_may26', 'H3', '2026-05-16', '2026-05-21'),
  ('h4_may26', 'H4', '2026-05-22', '2026-05-31');

-- Metrics
INSERT INTO metrics (id, project_id, name, type, sort_order) VALUES
  ('tsb_sotuv',      'tsb', 'Sotuv',     'daily',   1),
  ('tsb_leads',      'tsb', 'Leads',     'daily',   2),
  ('fc_sotuv',       'fc',  'Sotuv',     'daily',   1),
  ('fc_leads',       'fc',  'Leads',     'daily',   2),
  ('fc_retention',   'fc',  'Retention', 'weekly',  3),
  ('fc_churn',       'fc',  'Churn',     'inverse', 4),
  ('mc_reach',       'mc',  'Reach',     'daily',   1),
  ('mc_leads',       'mc',  'Leads',     'daily',   2),
  ('mc_sotuv',       'mc',  'Sotuv',     'daily',   3),
  ('sd_reach',       'sd',  'Reach',     'daily',   1),
  ('sd_leads',       'sd',  'Leads',     'daily',   2),
  ('sd_sotuv',       'sd',  'Sotuv',     'daily',   3);

-- Targets (H1 May 2026)
INSERT INTO targets (metric_id, period_id, weekly_target) VALUES
  ('tsb_sotuv',    'h1_may26', 63),
  ('tsb_leads',    'h1_may26', 120),
  ('fc_sotuv',     'h1_may26', 100),
  ('fc_leads',     'h1_may26', 1000),
  ('fc_retention', 'h1_may26', 25000000),
  ('fc_churn',     'h1_may26', 40),
  ('mc_reach',     'h1_may26', 715000),
  ('mc_leads',     'h1_may26', 360),
  ('mc_sotuv',     'h1_may26', 14),
  ('sd_reach',     'h1_may26', 2000000),
  ('sd_leads',     'h1_may26', 1667),
  ('sd_sotuv',     'h1_may26', 6);

-- Copy H1 targets to H2, H3, H4 as starting point
INSERT INTO targets (metric_id, period_id, weekly_target)
SELECT metric_id, 'h2_may26', weekly_target FROM targets WHERE period_id = 'h1_may26';

INSERT INTO targets (metric_id, period_id, weekly_target)
SELECT metric_id, 'h3_may26', weekly_target FROM targets WHERE period_id = 'h1_may26';

INSERT INTO targets (metric_id, period_id, weekly_target)
SELECT metric_id, 'h4_may26', weekly_target FROM targets WHERE period_id = 'h1_may26';
