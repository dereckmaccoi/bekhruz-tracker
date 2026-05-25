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
    if (projects.length === 0) return;
    setSelectedProject(prev => {
      // Keep current selection if it still exists in the list
      if (prev && projects.some(p => p.id === prev)) return prev;
      // Otherwise fall back to first project (handles deletion + initial load)
      return projects[0].id;
    });
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

  const TABS = [
    { key: 'data',     label: t('todaysData') },
    { key: 'periods',  label: 'Periods' },
    { key: 'targets',  label: t('targets') },
    { key: 'rollover', label: 'Rollover' },
    { key: 'projects', label: 'Projects' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Scrollable tab bar — never overflows on mobile */}
      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex gap-1 bg-stone-100 p-1 rounded-xl mx-4 mt-4 mb-5 w-fit min-w-full">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3.5 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors shrink-0 ${
                tab === key
                  ? 'bg-white text-stone-900 font-medium shadow-sm'
                  : 'text-stone-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-6">

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
    </div>
  );
}
