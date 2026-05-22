import { weeklyPercent, pacePercent } from '../../utils/calculations.js';

/**
 * SVG line chart of weekly performance % across the last N periods.
 *
 * Props:
 *   metrics         — array of metric objects { id, name, is_inverse }
 *   periods         — array of period objects sorted oldest → newest (up to 12)
 *   allEntries      — all-time entries (unfiltered)
 *   allTargets      — all targets (unfiltered)
 *   currentPeriodId — marks the active period with a vertical dotted line
 */
export default function TrendChart({ metrics, periods, allEntries, allTargets, currentPeriodId }) {
  if (!metrics?.length || !periods?.length) return null;

  const W = 600;
  const H = 120;
  const PAD_LEFT   = 8;
  const PAD_RIGHT  = 8;
  const PAD_TOP    = 10;
  const PAD_BOTTOM = 22; // room for x-axis labels

  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const today = new Date().toISOString().slice(0, 10);

  // Pre-bucket entries by period index and metric ID (one pass instead of O(periods × metrics × N))
  const periodRanges = periods.map(p => ({
    start: String(p.start_date).slice(0, 10),
    end:   String(p.end_date).slice(0, 10),
  }));
  // actualByPeriod[periodIdx][metricId] = total actual value
  const actualByPeriod = periods.map(() => ({}));
  allEntries.forEach(e => {
    const d = String(e.date).slice(0, 10);
    for (let i = 0; i < periodRanges.length; i++) {
      if (d >= periodRanges[i].start && d <= periodRanges[i].end) {
        actualByPeriod[i][e.metric_id] = (actualByPeriod[i][e.metric_id] || 0) + Number(e.value);
        break; // an entry belongs to exactly one period
      }
    }
  });

  // For each period × metric, compute the performance %
  const seriesData = metrics.map(m => {
    const points = periods.map((p, i) => {
      const { start: pStart, end: pEnd } = periodRanges[i];
      const isCompleted = pEnd < today;
      const actual = actualByPeriod[i][m.id] || 0;

      // Find target: period-specific first, then fallback to campaign
      const tgt = allTargets.find(t => t.period_id === p.id && t.metric_id === m.id)
        || (p.parent_id ? allTargets.find(t => t.period_id === p.parent_id && t.metric_id === m.id) : null);

      if (!tgt?.weekly_target) return { x: i, pct: null };

      const pct = isCompleted
        ? weeklyPercent(actual, tgt.weekly_target, !!m.is_inverse)
        : pacePercent(actual, tgt.weekly_target, p, !!m.is_inverse);

      return { x: i, pct };
    });
    return { metric: m, points };
  });

  // Only render if ≥ 2 periods have any data for any metric
  const periodsWithData = periods.filter((_, i) =>
    seriesData.some(s => s.points[i]?.pct !== null)
  );
  if (periodsWithData.length < 2 || periods.length < 2) return null;

  const n = periods.length;

  function xPos(i) {
    return PAD_LEFT + (i / (n - 1)) * chartW;
  }

  function yPos(pct) {
    // 0% → bottom, 120% → top (clamped to 0–120%)
    const clamped = Math.max(0, Math.min(120, pct));
    return PAD_TOP + chartH - (clamped / 120) * chartH;
  }

  // Build polyline points string for a series, skipping null gaps
  function buildPolylines(points) {
    const segments = [];
    let current = [];
    points.forEach(pt => {
      if (pt.pct !== null) {
        current.push(`${xPos(pt.x).toFixed(1)},${yPos(pt.pct).toFixed(1)}`);
      } else {
        if (current.length >= 2) segments.push(current.join(' '));
        current = [];
      }
    });
    if (current.length >= 2) segments.push(current.join(' '));
    return segments;
  }

  const PALETTE = ['#1D9E75', '#EF9F27', '#E24B4A', '#4A90D9', '#9B59B6', '#E67E22'];
  function metricColor(_m, idx) {
    return PALETTE[idx % PALETTE.length];
  }

  const currentIdx = periods.findIndex(p => p.id === currentPeriodId);

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
        {periods.length}-period trend
      </h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className="overflow-visible"
      >
        {/* 100% reference line */}
        <line
          x1={PAD_LEFT}
          y1={yPos(100)}
          x2={W - PAD_RIGHT}
          y2={yPos(100)}
          stroke="#D6D3CB"
          strokeWidth="1"
          strokeDasharray="4 3"
        />

        {/* Current period vertical marker */}
        {currentIdx >= 0 && (
          <line
            x1={xPos(currentIdx)}
            y1={PAD_TOP}
            x2={xPos(currentIdx)}
            y2={PAD_TOP + chartH}
            stroke="#B5B1A8"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Metric polylines */}
        {seriesData.map((s, idx) => {
          const color = metricColor(s.metric, idx);
          const segments = buildPolylines(s.points);
          return segments.map((pts, si) => (
            <polyline
              key={`${s.metric.id}-${si}`}
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.9"
            />
          ));
        })}

        {/* X-axis period labels */}
        {periods.map((p, i) => {
          // Show label for first, last, and current period; skip dense middle labels
          const showLabel = i === 0 || i === n - 1 || p.id === currentPeriodId
            || (n <= 6) || (i % Math.ceil(n / 6) === 0);
          if (!showLabel) return null;
          const name = p.name?.length > 5 ? p.name.slice(0, 5) : p.name;
          return (
            <text
              key={p.id}
              x={xPos(i)}
              y={H - 4}
              textAnchor="middle"
              fontSize="9"
              fill={p.id === currentPeriodId ? '#444441' : '#A09D96'}
              fontWeight={p.id === currentPeriodId ? '600' : '400'}
            >
              {name}
            </text>
          );
        })}
      </svg>

      {/* Metric legend */}
      {metrics.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {seriesData.map((s, idx) => (
            <div key={s.metric.id} className="flex items-center gap-1.5">
              <div
                className="w-3 h-0.5 rounded-full"
                style={{ backgroundColor: metricColor(s.metric, idx) }}
              />
              <span className="text-xs text-stone-500">{s.metric.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
