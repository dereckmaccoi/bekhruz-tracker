import { useState, useEffect, useRef } from 'react';
import { useLang } from '../../i18n/LangContext.jsx';

function toISODate(d) { return d.toISOString().slice(0, 10); }

function sameDay(a, b) { return a === b; }

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Monday-based: Mon=0 … Sun=6
function startDayOfMonth(year, month) {
  const d = new Date(year, month, 1).getDay();
  return (d + 6) % 7;
}

export default function CalendarPicker({ selectedDate, onChange, maxDate }) {
  const { t } = useLang();
  const today = toISODate(new Date());
  const max = maxDate || today;

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseInt(selectedDate.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => parseInt(selectedDate.slice(5, 7)) - 1);
  const ref = useRef(null);

  useEffect(() => {
    setViewYear(parseInt(selectedDate.slice(0, 4)));
    setViewMonth(parseInt(selectedDate.slice(5, 7)) - 1);
  }, [selectedDate]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    const firstOfNext = `${String(nextY).padStart(4,'0')}-${String(nextM+1).padStart(2,'0')}-01`;
    if (firstOfNext > max) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function selectDay(day) {
    const y = String(viewYear).padStart(4, '0');
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    if (iso > max) return;
    onChange(iso);
    setOpen(false);
  }

  function formatLabel(iso) {
    if (iso === today) return t('today');
    const yesterday = (() => {
      const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 1); return toISODate(d);
    })();
    if (iso === yesterday) return t('yesterday');
    const d = new Date(iso + 'T12:00:00');
    const months = t('months');
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  const isToday = selectedDate === today;
  const totalDays = getDaysInMonth(viewYear, viewMonth);
  const startOffset = startDayOfMonth(viewYear, viewMonth);

  const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
  const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
  const firstOfNext = `${String(nextY).padStart(4,'0')}-${String(nextM+1).padStart(2,'0')}-01`;
  const canGoNext = firstOfNext <= max;

  const months = t('months');
  const days = t('days');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors
          ${isToday
            ? 'border-stone-200 text-stone-700 hover:bg-stone-50'
            : 'border-[#7F77DD] bg-[#F3F2FB] text-[#4A45A0] hover:bg-[#ECEAFB]'
          }`}
      >
        {formatLabel(selectedDate)}
        <span className="ml-1.5 text-stone-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50 bg-white border border-stone-200 rounded-xl shadow-xl p-3 w-64 select-none">
          {/* Month/year header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-500 text-sm"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-stone-800">
              {months[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              disabled={!canGoNext}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-stone-100 text-stone-500 text-sm disabled:opacity-25"
            >
              ›
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {days.map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-stone-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1;
              const y = String(viewYear).padStart(4, '0');
              const m = String(viewMonth + 1).padStart(2, '0');
              const iso = `${y}-${m}-${String(day).padStart(2, '0')}`;
              const isFuture = iso > max;
              const isSelected = sameDay(iso, selectedDate);
              const isTodayCell = sameDay(iso, today);

              return (
                <button
                  key={day}
                  onClick={() => !isFuture && selectDay(day)}
                  disabled={isFuture}
                  className={`
                    h-8 w-full rounded-lg text-sm font-medium transition-colors
                    ${isSelected ? 'bg-stone-800 text-white' : ''}
                    ${!isSelected && isTodayCell ? 'bg-stone-100 text-stone-900 font-semibold' : ''}
                    ${!isSelected && !isTodayCell && !isFuture ? 'text-stone-700 hover:bg-stone-100' : ''}
                    ${isFuture ? 'text-stone-300 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {!isToday && (
            <div className="mt-3 pt-3 border-t border-stone-100">
              <button
                onClick={() => { onChange(today); setOpen(false); }}
                className="w-full text-xs text-stone-500 hover:text-stone-800 py-1 transition-colors"
              >
                {t('jumpToToday')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
