import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import ProjectPickerSheet from './ProjectPickerSheet.jsx';

const PROJECTS = [
  { id: 'tsb',  name: 'TSB',           color: '#E24B4A' },
  { id: 'fc',   name: 'Full Contact',  color: '#1D9E75' },
  { id: 'mc',   name: 'Milliard Club', color: '#7F77DD' },
  { id: 'sd',   name: 'Sales Doctor',  color: '#BA7517' },
];

function tabCls(active) {
  return `flex flex-col items-center gap-0.5 flex-1 py-2 text-[10px] font-medium transition-colors ${
    active ? 'text-stone-900' : 'text-stone-400'
  }`;
}

export default function BottomNav() {
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isProjectsActive = location.pathname.startsWith('/project/');

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-100 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Home */}
        <NavLink to="/dashboard" className={({ isActive }) => tabCls(isActive)}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          Home
        </NavLink>

        {/* Projects — opens picker sheet */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={tabCls(isProjectsActive)}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0121.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          Projects
        </button>

        {/* HADI */}
        <NavLink to="/hadi" className={({ isActive }) => tabCls(isActive)}>
          <span className="text-lg leading-none">🚀</span>
          HADI
        </NavLink>

        {/* Workshop */}
        <NavLink to="/workshop" className={({ isActive }) => tabCls(isActive)}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
          Workshop
        </NavLink>
      </nav>

      <ProjectPickerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projects={PROJECTS}
      />
    </>
  );
}
