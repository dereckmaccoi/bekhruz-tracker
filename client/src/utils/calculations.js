// Days elapsed in a period as of today (clamped to period bounds)
export function daysElapsed(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(period.start_date);
  const end = new Date(period.end_date);
  const clamped = today > end ? end : today < start ? start : today;
  return Math.max(1, Math.round((clamped - start) / 86400000) + 1);
}

// Expected cumulative by today
export function expectedByToday(weeklyTarget, period) {
  return Math.round((daysElapsed(period) / period.days) * weeklyTarget);
}

// Daily target for one day
export function dailyTarget(weeklyTarget, period) {
  return Math.round(weeklyTarget / period.days);
}

// Pace % (actual vs expected by today)
export function pacePercent(actual, weeklyTarget, period, isInverse) {
  const expected = expectedByToday(weeklyTarget, period);
  if (!expected) return null;
  // For inverse metrics (e.g. cost per lead), 0 actual means no data — can't divide
  if (isInverse && !actual) return null;
  return isInverse
    ? Math.round((expected / actual) * 100)
    : Math.round((actual / expected) * 100);
}

// Weekly % (actual vs full weekly target — used in history)
export function weeklyPercent(actual, weeklyTarget, isInverse) {
  if (!weeklyTarget) return null;
  if (isInverse && !actual) return null;
  return isInverse
    ? Math.round((weeklyTarget / actual) * 100)
    : Math.round((actual / weeklyTarget) * 100);
}

// Status label from %
export function statusLabel(pct, isInverse) {
  if (pct === null) return 'no data';
  if (isInverse) return pct <= 90 ? 'good' : pct <= 110 ? 'close' : 'over';
  return pct >= 100 ? 'on pace' : pct >= 70 ? 'close' : 'behind';
}

// Color key from %
export function colorKey(pct, isInverse) {
  if (pct === null) return 'gray';
  // For inverse metrics, pacePercent = expected/actual, so higher is still better —
  // same thresholds apply in both directions.
  return pct >= 90 ? 'green' : pct >= 70 ? 'amber' : 'red';
}

// Format number with space as thousands separator
export function formatNum(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Detect active period from a list (period containing today, or most recent past).
// Prefers child periods (weeks with parent_id) over parent campaigns so that
// targets and entries are always resolved at the week level first.
export function detectActivePeriod(periods) {
  if (!periods || periods.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);

  // 1. Prefer an active week (child period with parent_id)
  const activeChild = periods.find(p =>
    p.parent_id &&
    String(p.start_date).slice(0, 10) <= today &&
    String(p.end_date).slice(0, 10) >= today
  );
  if (activeChild) return activeChild;

  // 2. Fall back to any period containing today (e.g. standalone campaigns)
  const active = periods.find(p =>
    String(p.start_date).slice(0, 10) <= today &&
    String(p.end_date).slice(0, 10) >= today
  );
  if (active) return active;

  // 3. Most recent past period, or first period
  const past = periods.filter(p => String(p.end_date).slice(0, 10) < today);
  return past.length > 0 ? past[past.length - 1] : periods[0];
}

// Resolve target for a metric in a period.
// First checks for a period-specific target (week override).
// Falls back to the parent campaign's target when none exists.
export function resolveTarget(targets, metricId, period) {
  if (!targets || !period) return null;
  return targets.find(t => t.period_id === period.id && t.metric_id === metricId)
      || (period.parent_id
          ? targets.find(t => t.period_id === period.parent_id && t.metric_id === metricId)
          : null);
}

// Color CSS classes for status
export const COLOR_CLASSES = {
  green: {
    bg: 'bg-[#E1F5EE]',
    text: 'text-[#085041]',
    border: 'border-[#1D9E75]',
    bar: 'bg-[#1D9E75]',
    tag: 'bg-[#E1F5EE] text-[#085041] border border-[#1D9E75]',
  },
  amber: {
    bg: 'bg-[#FAEEDA]',
    text: 'text-[#633806]',
    border: 'border-[#EF9F27]',
    bar: 'bg-[#EF9F27]',
    tag: 'bg-[#FAEEDA] text-[#633806] border border-[#EF9F27]',
  },
  red: {
    bg: 'bg-[#FCEBEB]',
    text: 'text-[#791F1F]',
    border: 'border-[#E24B4A]',
    bar: 'bg-[#E24B4A]',
    tag: 'bg-[#FCEBEB] text-[#791F1F] border border-[#E24B4A]',
  },
  gray: {
    bg: 'bg-[#F1EFE8]',
    text: 'text-[#444441]',
    border: 'border-stone-300',
    bar: 'bg-stone-300',
    tag: 'bg-[#F1EFE8] text-[#444441] border border-stone-300',
  },
};

