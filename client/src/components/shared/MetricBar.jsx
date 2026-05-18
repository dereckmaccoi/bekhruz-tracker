import { COLOR_CLASSES, formatNum } from '../../utils/calculations.js';
import { useLang } from '../../i18n/LangContext.jsx';

export default function MetricBar({ metric, pace, trend = null }) {
  const { t } = useLang();
  if (!pace) return null;
  const { actual, weeklyTarget, pct, color, gap, expected, isInverse,
          isAhead, catchUpPerDay, remainingDays, isCampaign,
          campaignCompletionPct } = pace;

  const c = COLOR_CLASSES[color] || COLOR_CLASSES.gray;

  // Completion: actual as % of the full weekly target
  const completionPct = weeklyTarget
    ? Math.min(100, (actual / weeklyTarget) * 100)
    : 0;

  // Marker: where you should be today, as % of weekly target (clamped so it stays visible)
  const markerPct = weeklyTarget && expected
    ? Math.min(97, Math.max(3, (expected / weeklyTarget) * 100))
    : null;

  // c.bar is already pace-based (via colorKey) and works correctly for
  // both normal and inverse metrics — no separate branch needed.
  const barColor = c.bar;

  return (
    <div className="py-3">
      {/* ── Metric name + raw numbers ─────────────────────────────── */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-stone-700 flex items-center gap-1">
          {metric.name}
          {trend !== null && (
            <span className={`text-xs font-bold ${trend > 5 ? 'text-[#1D9E75]' : trend < -5 ? 'text-[#E24B4A]' : 'text-stone-400'}`}>
              {trend > 5 ? '↑' : trend < -5 ? '↓' : '→'}
            </span>
          )}
        </span>
        <div className="flex items-baseline gap-2">
          {isCampaign && campaignCompletionPct !== null && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium">
              {campaignCompletionPct}% of goal
            </span>
          )}
          <span className="text-sm text-stone-500">
            <span className="font-semibold text-stone-800">{formatNum(actual)}</span>
            <span className="text-stone-300 mx-1.5">/</span>
            {formatNum(weeklyTarget)}
          </span>
        </div>
      </div>

      {/* ── Bar + floating marker label ───────────────────────────── */}
      {/* pt-6 reserves space for the label that floats above the bar */}
      <div className="relative pt-6 mb-1.5">

        {/* Floating label above the marker line */}
        {markerPct !== null && (
          <div
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none"
            style={{ left: `${markerPct}%` }}
          >
            <span className="text-[10px] font-semibold text-stone-600 whitespace-nowrap leading-tight">
              {formatNum(expected)}
            </span>
            <span className="text-[9px] text-stone-400 whitespace-nowrap leading-tight">
              {Math.round((expected / weeklyTarget) * 100)}%
            </span>
          </div>
        )}

        {/* Bar */}
        <div className="relative h-2.5">
          <div className="absolute inset-0 rounded-full bg-stone-100" />
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${completionPct}%` }}
          />
          {/* Marker line */}
          {markerPct !== null && (
            <div
              className="absolute top-0 h-full w-0.5 bg-stone-500/50 rounded-full"
              style={{ left: `${markerPct}%` }}
            />
          )}
        </div>
      </div>

      {/* ── Two-column stat footer ────────────────────────────────── */}
      <div className="flex items-center justify-between mt-0.5">
        {/* Left: pace badge + gap */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${c.tag}`}>
            {pct !== null ? `${pct}%` : '—'} pace
          </span>
          <span className="text-xs text-stone-400 truncate">
            {isAhead
              ? t('gapAhead', { n: formatNum(Math.abs(gap)), expected: formatNum(expected) })
              : t('gapBehind', { n: formatNum(Math.abs(gap)), expected: formatNum(expected) })}
          </span>
        </div>

        {/* Right: completion */}
        <span className="text-xs text-stone-400 shrink-0 ml-2">
          {Math.round(completionPct)}% of goal
        </span>
      </div>

      {/* ── Catch-up line (only when behind on a regular metric) ──── */}
      {catchUpPerDay !== null && remainingDays > 0 && (
        <div className="mt-1 text-xs text-amber-600 font-medium">
          Need {formatNum(catchUpPerDay)}/day · {remainingDays} day{remainingDays !== 1 ? 's' : ''} left
        </div>
      )}
    </div>
  );
}
