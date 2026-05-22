import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DataTab from './DataTab.jsx';
import TargetsTab from './TargetsTab.jsx';
import PeriodsTab from './PeriodsTab.jsx';
import RolloverTab from './RolloverTab.jsx';
import ProjectsTab from './ProjectsTab.jsx';
import { api } from '../../hooks/useApi.js';
import { useLang } from '../../i18n/LangContext.jsx';
import { detectActivePeriod } from '../../utils/calculations.js';
import { useProjects } from '../../context/ProjectsContext.jsx';

export default function Workshop() {
  const { t } = useLang();
  const location = useLocation();
  const initTab     = location.state?.tab === 'targets' ? 'targets' : 'data';
  const initProject = location.state?.project || null;

  const { projects } = useProjects();
  const [tab, setTab]             = useState(initTab);  // 'data' | 'periods' | 'targets' | 'rollover' | 'projects'
  const [selectedProject, setSelectedProject] = useState(initProject);

  // Per-project periods (loaded whenever selectedProject changes)
  const [projectPeriods, setProjectPeriods]           = useState([]);
  const [projectActivePeriod, setProjectActivePeriod] = useState(null);

  useEffect(() => {
    setWorkshopActive?.(true);
    // Pick first project if nothing was pre-selected
    if (!initProject && projects.length > 0) setSelectedProject(prev => prev || projects[0].id);
    return () => setWorkshopActive?.(false);
  }, [projects]);

  // Reload periods whenever the selected project changes
  useEffect(() => {
    if (!selectedProject) return;
    api.getPeriods({ project_id: selectedProject }).then(data => {
      setProjectPeriods(data);
      setProjectActivePeriod(detectActivePeriod(data));
    }).catch(() => {});
  }, [selectedProject]);

  // Called by TargetsTab after it creates / deletes a period
  const handlePeriodsChange = () => {
    if (!selectedProject) return;
    api.getPeriods({ project_id: selectedProject }).then(data => {
      setProjectPeriods(data);
      setProjectActivePeriod(detectActivePeriod(data));
    }).catch(() => {});
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-1 mb-6">
        <div className="flex gap-1 bg-stone-100 p-1 rounded-lg">
          <button
            onClick={() => setTab('data')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === 'data'
                ? 'bg-white text-stone-900 font-medium shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('todaysData')}
          </button>
          <button
            onClick={() => setTab('periods')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === 'periods'
                ? 'bg-white text-stone-900 font-medium shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            Periods
          </button>
          <button
            onClick={() => setTab('targets')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === 'targets'
                ? 'bg-white text-stone-900 font-medium shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {t('targets')}
          </button>
          <button
            onClick={() => setTab('rollover')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === 'rollover'
                ? 'bg-white text-stone-900 font-medium shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            Rollover
          </button>
          <button
            onClick={() => setTab('projects')}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === 'projects'
                ? 'bg-white text-stone-900 font-medium shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            Projects
          </button>
        </div>
        <span className="text-xs text-stone-400 ml-2">{t('ctrlEnterHint')}</span>
      </div>

      {tab === 'data' && (
        <DataTab
          periods={projectPeriods}
          activePeriod={projectActivePeriod}
          selectedProject={selectedProject}
          onProjectChange={setSelectedProject}
          projects={projects}
        />
      )}
      {tab === 'periods' && (
        <PeriodsTab
          selectedProject={selectedProject}
          projects={projects}
          onProjectChange={setSelectedProject}
          onPeriodsChange={handlePeriodsChange}
        />
      )}
      {tab === 'targets' && (
        <TargetsTab
          periods={projectPeriods}
          activePeriod={projectActivePeriod}
          projects={projects}
          selectedProject={selectedProject}
          onProjectChange={setSelectedProject}
          onPeriodsChange={handlePeriodsChange}
        />
      )}
      {tab === 'rollover' && (
        <RolloverTab
          periods={projectPeriods}
          selectedProject={selectedProject}
          projects={projects}
          onProjectChange={p => { setSelectedProject(p); }}
        />
      )}
      {tab === 'projects' && (
        <ProjectsTab />
      )}
    </div>
  );
}
