import { useState } from 'react';
import { weeklyPercent, colorKey, formatNum, COLOR_CLASSES, resolveTarget } from '../../utils/calculations.js';
import { useLang } from '../../i18n/LangContext.jsx';

export default function HistoryTable({ metrics, periods, allEntries, allTargets }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(null);
  const [shown, setShown]       = useState(2);

  if (!metrics || !periods || periods.length === 0) {
    return <p className="text-sm text-stone-400">{t('noCompletedPeriods')}</p>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const completedPeriods = periods
    .filter(p => p.end_date.slice(0, 10) < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date));

  const visiblePeriods = completedPeriods.slice(0, shown);

  const getActual = (period, metricId) => {
    const s = String(period.start_date).slice(0, 10);
    const e = String(period.end_date).slice(0, 10);
    return (allEntries || [])
      .filter(en => en.metric_id === metricId && String(en.date).slice(0, 10) >= s && String(en.date).slice(0, 10) <= e)
      .reduce((sum, en) => sum + Number(en.value), 0);
  };

  const getTarget = (period, metricId) => {
    const tgt = resolveTarget(allTargets, metricId, period);
    return tgt?.weekly_target || 0;
  };

  const periodScore = (period) => {
    const pcts = metrics.map(m => {
      const actual = getActual(period, m.id);
      const target = getTarget(period, m.id);
      return weeklyPercent(actual, target, !!m.is_inverse);
    }).filter(p => p !== null);
    if (pcts.length === 0) return null;
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  };

  const exportCSV = () => {
    const rows = [['Period', 'Start', 'End', 'Metric', 'Target', 'Actual', 'Pct']];
    completedPeriods.forEach(p => {
      metrics.forEach(m => {
        const actual = getActual(p, m.id);
        const target = getTarget(p, m.id);
        const pct = target > 0 ? Math.round((actual / target) * 100) : '';
        rows.push([
          p.name,
          String(p.start_date).slice(0, 10),
          String(p.end_date).slice(0, 10),
          m.name,
          target,
          actual,
          pct !== '' ? `${pct}%` : '',
        ]);
      });
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracker-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Sub-header row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-stone-400">
          {completedPeriods.length} completed period{completedPeriods.length !== 1 ? 's' : ''}
        </span>
        {completedPeriods.length > 0 && (
          <button
            type="button"
            onClick={exportCSV}
            className="text-xs text-stone-400 hover:text-stone-600 border border-stone-200 rounded px-2 py-0.5 hover:border-stone-400 transition-colors"
          >
            Export CSV
          </button>
        )}
      </div>

      {/* Period list — 2-column layout: name | score */}
      <div className="divide-y divide-stone-100">
        {visiblePeriods.map(period => {
          const score      = periodScore(period);
          const scoreColor = colorKey(score, false);
          const c          = COLOR_CLASSES[scoreColor] || COLOR_CLASSES.gray;
          const isExpanded = expanded === period.id;

          return (
            <div key={period.id}>
              {/* Collapsed row: Period name + Score */}
              <button
                type="button"
                className="w-full flex items-center justify-between py-2.5 gap-3 text-left"
                onClick={() => setExpanded(isExpanded ? null : period.id)}
              >
                <span className="flex items-center gap-1.5 text-sm text-stone-700 font-medium">
                  <span className="text-stone-400 text-xs">{isExpanded ? '▾' : '▸'}</span>
                  {period.name}
                  <span className="text-[11px] text-stone-400 font-normal">
                    {String(period.start_date).slice(5, 10).replace('-', '/')} – {String(period.end_date).slice(5, 10).replace('-', '/')}
                  </span>
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0 ${c.tag}`}>
                  {score !== null ? `${score}%` : '—'}
                </span>
              </button>

              {/* Expanded: per-metric breakdown */}
              {isExpanded && (
                <div className="pb-3 px-1 space-y-1.5">
                  {metrics.map(m => {
                    const actual = getActual(period, m.id);
                    const target = getTarget(period, m.id);
                    const pct    = weeklyPercent(actual, target, !!m.is_inverse);
                    const ck     = colorKey(pct, !!m.is_inverse);
                    const mc     = COLOR_CLASSES[ck] || COLOR_CLASSES.gray;
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-stone-500 w-20 shrink-0">{m.name}</span>
                        <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${mc.bar}`}
                            style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${mc.tag}`}>
                          {pct !== null ? `${pct}%` : '—'}
                        </span>
                        <span className="text-stone-400 shrink-0 w-20 text-right">
                          {formatNum(actual)}<span className="text-stone-300">/{formatNum(target)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {completedPeriods.length === 0 && (
        <p className="text-sm text-stone-400 py-4">{t('noCompletedPeriods')}</p>
      )}

      {completedPeriods.length > shown && (
        <button
          type="button"
          className="mt-3 text-sm text-stone-400 hover:text-stone-600 underline"
          onClick={() => setShown(s => s + 3)}
        >
          {t('loadMore')}
        </button>
      )}
    </div>
  );
}
