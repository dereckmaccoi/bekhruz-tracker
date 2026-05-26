import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import BottomNav from './components/BottomNav.jsx';
import Dashboard from './components/Dashboard.jsx';
import ProjectPage from './components/ProjectPage.jsx';
import Workshop from './components/Workshop/index.jsx';
import HadiPage from './components/HadiPage.jsx';
import QuickEntry from './components/QuickEntry.jsx';
import { api } from './hooks/useApi.js';
import { LangProvider, useLang } from './i18n/LangContext.jsx';
import { ProjectsProvider } from './context/ProjectsContext.jsx';
import PinGate from './components/PinGate.jsx';
import TelegramAuthGate from './components/TelegramAuthGate.jsx';

function AppInner() {
  const { t } = useLang();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.getHealth().catch(() => setOffline(true));
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-stone-50">
      {offline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#FCEBEB] text-[#791F1F] text-sm text-center py-2 border-b border-[#E24B4A]">
          {t('serverOffline')}
        </div>
      )}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/project/:id" element={<ProjectPage />} />
          <Route path="/workshop" element={<Workshop />} />
          <Route path="/hadi" element={<HadiPage />} />
        </Routes>
      </main>
      <BottomNav />
      <QuickEntry />
    </div>
  );
}

export default function App() {
  return (
    <TelegramAuthGate>
      <LangProvider>
        <PinGate>
          <ProjectsProvider>
            <BrowserRouter>
              <AppInner />
            </BrowserRouter>
          </ProjectsProvider>
        </PinGate>
      </LangProvider>
    </TelegramAuthGate>
  );
}
