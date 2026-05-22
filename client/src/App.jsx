import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './components/Dashboard.jsx';
import ProjectPage from './components/ProjectPage.jsx';
import Workshop from './components/Workshop/index.jsx';
import HadiPage from './components/HadiPage.jsx';
import MusicPlayer from './components/MusicPlayer.jsx';
import QuickEntry from './components/QuickEntry.jsx';
import { api } from './hooks/useApi.js';
import { detectActivePeriod } from './utils/calculations.js';
import { LangProvider, useLang } from './i18n/LangContext.jsx';
import { ProjectsProvider } from './context/ProjectsContext.jsx';
import PinGate from './components/PinGate.jsx';

function AppInner() {
  const { t } = useLang();
  const [periods, setPeriods] = useState([]);
  const [activePeriod, setActivePeriod] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [workshopActive, setWorkshopActive] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.getPeriods()
      .then(data => {
        setPeriods(data);
        setActivePeriod(detectActivePeriod(data));
      })
      .catch(() => setOffline(true));
  }, []);

  const handleSaved = () => {
    const now = new Date();
    setLastSaved(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50">
      {offline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#FCEBEB] text-[#791F1F] text-sm text-center py-2 border-b border-[#E24B4A]">
          {t('serverOffline')}
        </div>
      )}
      <Sidebar
        lastSaved={lastSaved}
        workshopActive={workshopActive}
      />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={<Dashboard />}
          />
          <Route
            path="/project/:id"
            element={
              <ProjectPage />
            }
          />
          <Route
            path="/workshop"
            element={
              <Workshop
                onSaved={handleSaved}
                setWorkshopActive={setWorkshopActive}
              />
            }
          />
          <Route path="/hadi" element={<HadiPage />} />
        </Routes>
      </main>
      <QuickEntry />
      <MusicPlayer />
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
      <PinGate>
        <ProjectsProvider>
          <BrowserRouter>
            <AppInner />
          </BrowserRouter>
        </ProjectsProvider>
      </PinGate>
    </LangProvider>
  );
}
