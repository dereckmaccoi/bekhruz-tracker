import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../hooks/useApi.js';

const ProjectsContext = createContext(null);

export function ProjectsProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    api.getProjects()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createProject = async (body) => {
    await api.createProject(body);
    reload();
  };

  const updateProject = async (id, body) => {
    await api.updateProject(id, body);
    reload();
  };

  const deleteProject = async (id) => {
    await api.deleteProject(id);
    reload();
  };

  return (
    <ProjectsContext.Provider value={{ projects, loading, reload, createProject, updateProject, deleteProject }}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used inside <ProjectsProvider>');
  return ctx;
}
