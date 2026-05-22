const BASE = import.meta.env.VITE_API_URL || '/api';

// Module-level: set by TelegramAuthGate after successful validation
let telegramInitData = null;

export function setInitData(data) {
  telegramInitData = data;
}

async function request(path, options = {}) {
  const { body: rawBody, ...rest } = options;
  const headers = { 'Content-Type': 'application/json' };
  if (telegramInitData) headers['x-telegram-init-data'] = telegramInitData;

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers,
    body: rawBody ? JSON.stringify(rawBody) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Health
  getHealth: () => request('/health'),

  // Projects
  getProjects: () => request('/projects'),
  createProject: (body) => request('/projects', { method: 'POST', body }),
  updateProject: (id, body) => request(`/projects/${id}`, { method: 'PUT', body }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),

  // Periods
  getPeriods: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/periods${q ? `?${q}` : ''}`);
  },
  createPeriod: (body) => request('/periods', { method: 'POST', body }),
  updatePeriod: (id, body) => request(`/periods/${id}`, { method: 'PUT', body }),
  deletePeriod: (id) => request(`/periods/${id}`, { method: 'DELETE' }),

  // Metrics
  getMetrics: (projectId) => request(`/metrics${projectId ? `?project_id=${projectId}` : ''}`),
  createMetric: (body) => request('/metrics', { method: 'POST', body }),
  updateMetric: (id, body) => request(`/metrics/${id}`, { method: 'PUT', body }),
  deleteMetric: (id) => request(`/metrics/${id}`, { method: 'DELETE' }),

  // Targets
  getTargets: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/targets${q ? `?${q}` : ''}`);
  },
  upsertTarget: (body) => request('/targets', { method: 'POST', body }),

  // Entries
  getEntries: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/entries${q ? `?${q}` : ''}`);
  },
  upsertEntry: (body) => request('/entries', { method: 'POST', body }),

  // Project (data + entries for a period)
  getProject: (id, period_id) => request(`/project/${id}?period_id=${period_id}`),

  // Hypotheses
  getHypotheses: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/hypotheses${q ? `?${q}` : ''}`);
  },
  createHypothesis: (body) => request('/hypotheses', { method: 'POST', body }),
  updateHypothesis: (id, body) => request(`/hypotheses/${id}`, { method: 'PUT', body }),
  deleteHypothesis: (id) => request(`/hypotheses/${id}`, { method: 'DELETE' }),
};
