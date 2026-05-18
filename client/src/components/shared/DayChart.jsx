import { formatNum, dailyTarget } from '../../utils/calculations.js';
import { useLang } from '../../i18n/LangContext.jsx';

function getDayColor(value, target, isInverse, isFuture, hasData) {
  if (isFuture) return 'future';
  if (!hasData) return 'empty';
  if (isInverse) {
    if (value <= target) return 'green';
    if (value <= target * 1.1) return 'amber';
    return 'red';
  }
  const pct = target > 0 ? (value / target) * 100 : 100;
  if (pct >= 100) return 'green';
  if (pct >= 70) return 'amber';
  return 'red';
}

const BAR_COLORS = {
  green: 'bg-[#1D9E75]',
  amber: 'bg-[#EF9F27]',
  red: 'bg-[#E24B4A]',
  empty: 'bg-transparent border border-stone-200',
  future: 'bg-transparent border border-dashed border-stone-200',
};

export default function DayChart({ metric, entries, period, weeklyTarget }) {
  const { t } = useLang();
  if (!period) return null;

  const start = new Date(period.start_date);
  const end = new Date(period.end_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const entryMap = {};
  entries?.forEach(e => {
    const key = e.date.slice(0, 10);
    entryMap[key] = Number(e.value);
  });

  const dt = dailyTarget(weeklyTarget, period);
  const maxVal = Math.max(dt, ...days.map(d => {
    const key = d.toISOString().slice(0, 10);
    return entryMap[key] || 0;
  }), 1);

  const total = days.reduce((sum, d) => {
    const key = d.toISOString().slice(0, 10);
    return sum + (entryMap[key] || 0);
  }, 0);

  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

  return (
    <div className="flex gap-3">
      <div className="flex-1">
        <div className="flex items-end gap-1 h-32">
          {days.map(d => {
            const key = d.toISOString().slice(0, 10);
            const value = entryMap[key];
            const isFuture = d > today;
            const hasData = value !== undefined;
            const color = getDayColor(value || 0, dt, !!metric?.is_inverse, isFuture, hasData);
            const heightPct = hasData ? Math.min(100, ((value || 0) / maxVal) * 100) : 0;
            const weekend = isWeekend(d);
            const todayKey = today.toISOString().slice(0, 10);
            const isToday = key === todayKey;

            return (
              <div key={key} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex flex-col items-center justify-end" style={{ height: '7rem' }}>
                  {isToday && (
                    <div className="w-1.5 h-1.5 rounded-full bg-stone-700 mb-0.5 shrink-0" />
                  )}
                  <div
                    className={`w-full rounded-t transition-all ${BAR_COLORS[color]} ${weekend ? 'opacity-70' : ''}`}
                    style={{ height: hasData || isFuture ? `${Math.max(6, heightPct)}%` : '6%' }}
                    title={hasData ? `${formatNum(value)}` : (isFuture ? 'future' : 'no data')}
                  />
                </div>
                <span className={`text-[9px] ${isToday ? 'font-bold text-stone-700' : 'text-stone-400'}`}>{d.getDate()}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-28 shrink-0 flex flex-col justify-center gap-2 pl-2 border-l border-stone-100">
        <div>
          <p className="text-[10px] text-stone-400 uppercase tracking-wide">{t('dailyTarget')}</p>
          <p className="text-base font-semibold text-stone-800">{formatNum(dt)}</p>
        </div>
        <div>
          <p className="text-[10px] text-stone-400 uppercase tracking-wide">{t('totalSoFar')}</p>
          <p className="text-base font-semibold text-stone-800">{formatNum(total)}</p>
        </div>
        <div>
          <p className="text-[10px] text-stone-400 uppercase tracking-wide">{t('weeklyTarget')}</p>
          <p className="text-sm text-stone-500">{formatNum(weeklyTarget)}</p>
        </div>
      </div>
    </div>
  );
}
