import { NavLink } from 'react-router-dom';
import { useLang } from '../i18n/LangContext.jsx';

const PROJECTS = [
  { id: 'tsb',  name: 'TSB',           color: '#E24B4A' },
  { id: 'fc',   name: 'Full Contact',  color: '#1D9E75' },
  { id: 'mc',   name: 'Milliard Club', color: '#7F77DD' },
  { id: 'sd',   name: 'Sales Doctor',  color: '#BA7517' },
];

const LANGS = ['en', 'ru', 'uz'];

export default function Sidebar({ lastSaved, workshopActive }) {
  const { t, lang, setLang } = useLang();

  const navLink = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
      isActive
        ? 'bg-stone-900 text-white font-medium'
        : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'
    }`;

  const projectLink = (color) => ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
      isActive
        ? 'bg-stone-100 text-stone-900 font-medium'
        : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50'
    }`;

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-stone-100 flex flex-col h-full">

      {/* Brand */}
      <div className="px-4 pt-5 pb-5 border-b border-stone-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-stone-900 flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-white text-sm font-bold">B</span>
          </div>
          <div>
            <div className="font-bold text-stone-900 text-sm leading-tight">Bekhruz</div>
            <div className="text-[11px] text-stone-400 leading-tight mt-0.5">Performance Tracker</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">

        <div>
          <p className="px-2 pb-2 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
            {t('overview')}
          </p>
          <NavLink to="/dashboard" className={navLink}>
            {({ isActive }) => (
              <>
                <svg className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-stone-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                {t('dashboard')}
              </>
            )}
          </NavLink>
        </div>

        <div>
          <p className="px-2 pb-2 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
            {t('projects')}
          </p>
          <div className="space-y-0.5">
            {PROJECTS.map(p => (
              <NavLink key={p.id} to={`/project/${p.id}`} className={projectLink(p.color)}>
                {({ isActive }) => (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform"
                      style={{ backgroundColor: p.color, transform: isActive ? 'scale(1.3)' : 'scale(1)' }}
                    />
                    <span className="truncate">{p.name}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>

      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-stone-100 space-y-3">
        {/* Lang switcher */}
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
          {LANGS.map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`flex-1 py-1 text-[11px] rounded-md font-bold transition-all uppercase tracking-wider
                ${lang === l
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-400 hover:text-stone-700'
                }`}
            >
              {l}
            </button>
          ))}
        </div>

        {lastSaved && (
          <p className="text-[11px] text-stone-400 px-1">
            {t('lastSaved')}: {lastSaved}
          </p>
        )}

        <NavLink
          to="/workshop"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive || workshopActive
                ? 'bg-[#1D9E75] text-white shadow-sm'
                : 'text-stone-600 bg-stone-50 hover:bg-stone-100 hover:text-stone-900 border border-stone-200'
            }`
          }
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
          {t('workshop')}
        </NavLink>
      </div>
    </aside>
  );
}
