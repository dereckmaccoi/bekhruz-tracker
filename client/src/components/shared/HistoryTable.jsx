import { useState } from 'react';
import { weeklyPercent, colorKey, formatNum, COLOR_CLASSES, resolveTarget } from '../../utils/calculations.js';
import { useLang } from '../../i18n/LangContext.jsx';

export default function HistoryTable({ metrics, periods, allEntries, allTargets }) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(null);
  const [shown, setShown] = useState(2);

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
      return weeklyPercent(actual, target, m.type === 'inverse');
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
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-stone-400">
          {completedPeriods.length} completed period{completedPeriods.length !== 1 ? 's' : ''}
        </span>
        {completedPeriods.length > 0 && (
          <button
            onClick={exportCSV}
            className="text-xs text-stone-400 hover:text-stone-600 border border-stone-200 rounded px-2 py-0.5 hover:border-stone-400 transition-colors"
          >
            Export CSV
          </button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="text-left py-2 text-stone-500 font-medium">{t('colPeriod')}</th>
            {metrics.map(m => (
              <th key={m.id} className="text-right py-2 text-stone-500 font-medium px-2">{m.name} %</th>
            ))}
            <th className="text-right py-2 text-stone-500 font-medium px-2">{t('colScore')}</th>
          </tr>
        </thead>
        <tbody>
          {visiblePeriods.map(period => {
            const score = periodScore(period);
            const scoreColor = colorKey(score, false);
            const c = COLOR_CLASSES[scoreColor] || COLOR_CLASSES.gray;
            const isExpanded = expanded === period.id;

            return (
              <>
                <tr
                  key={period.id}
                  className="border-b border-stone-100 cursor-pointer hover:bg-stone-50 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : period.id)}
                >
                  <td className="py-2 text-stone-700">
                    <span className="mr-1 text-stone-400">{isExpanded ? '▾' : '▸'}</span>
                    {period.name}
                  </td>
                  {metrics.map(m => {
                    const actual = getActual(period, m.id);
                    const target = getTarget(period, m.id);
                    const pct = weeklyPercent(actual, target, m.type === 'inverse');
                    const ck = colorKey(pct, m.type === 'inverse');
                    const mc = COLOR_CLASSES[ck] || COLOR_CLASSES.gray;
                    return (
                      <td key={m.id} className="py-2 text-right px-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${mc.tag}`}>
                          {pct !== null ? `${pct}%` : '—'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-2 text-right px-2">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.tag}`}>
                      {score !== null ? `${score}%` : '—'}
                    </span>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${period.id}-detail`} className="bg-stone-50">
                    <td colSpan={metrics.length + 2} className="py-3 px-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        {metrics.map(m => {
                          const actual = getActual(period, m.id);
                          const target = getTarget(period, m.id);
                          return (
                            <div key={m.id} className="flex justify-between text-xs text-stone-600 py-0.5 border-b border-stone-100">
                              <span className="text-stone-500">{m.name}</span>
                              <span>{formatNum(actual)} / {formatNum(target)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>

      {completedPeriods.length > shown && (
        <button
          className="mt-3 text-sm text-stone-400 hover:text-stone-600 underline"
          onClick={() => setShown(s => s + 3)}
        >
          {t('loadMore')}
        </button>
      )}

      {completedPeriods.length === 0 && (
        <p className="text-sm text-stone-400 py-4">{t('noCompletedPeriods')}</p>
      )}
    </div>
  );
}
