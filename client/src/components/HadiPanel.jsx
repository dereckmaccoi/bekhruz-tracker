import { useState, useEffect } from 'react';

const PROJECTS = [
  { id: 'tsb',  name: 'TSB' },
  { id: 'fc',   name: 'Full Contact' },
  { id: 'mc',   name: 'Milliard Club' },
  { id: 'sd',   name: 'Sales Doctor' },
];

const STATUSES = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done',        label: 'Done' },
];

const EMPTY = {
  project_id: '', hypothesis: '', point_a: '', point_b: '',
  action_deadline: '', insight_deadline: '', responsible: '',
  result: '', idea_score: '', success: '', status: 'not_started',
  insight: '', campaign_context: '',
};

export default function HadiPanel({ initial, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
  }, [initial]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.hypothesis.trim()) return;
    setSaving(true);
    try {
      // eslint-disable-next-line no-unused-vars
      const { id: _id, created_at: _ca, updated_at: _ua, ...formFields } = form;
      const payload = {
        ...formFields,
        project_id:       form.project_id       || null,
        action_deadline:  form.action_deadline   || null,
        insight_deadline: form.insight_deadline  || null,
        idea_score:       form.idea_score !== '' ? Number(form.idea_score) : null,
        success:          form.success === 'true' ? true : form.success === 'false' ? false : null,
      };
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 bg-white';
  const labelCls = 'block text-xs font-medium text-stone-500 mb-1';

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/20" />

      {/* panel */}
      <div
        className="relative z-10 w-[480px] max-w-full bg-white h-full shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-stone-900 text-base">
            {initial?.id ? 'Edit hypothesis' : 'New hypothesis'}
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* form body */}
        <form id="hadi-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* H — Hypothesis */}
          <div>
            <label className={labelCls}>🧪 Hypothesis <span className="text-red-500">*</span></label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="If we do X, then Y will happen because Z"
              value={form.hypothesis}
              onChange={e => set('hypothesis', e.target.value)}
              required
            />
          </div>

          {/* A — Action */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>⚡ Point A (current state)</label>
              <input className={inputCls} value={form.point_a} onChange={e => set('point_a', e.target.value)} placeholder="e.g. 3% CTR" />
            </div>
            <div>
              <label className={labelCls}>🎯 Point B (target)</label>
              <input className={inputCls} value={form.point_b} onChange={e => set('point_b', e.target.value)} placeholder="e.g. 5% CTR" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>📅 Action deadline</label>
              <input type="date" className={inputCls} value={form.action_deadline} onChange={e => set('action_deadline', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>📅 Insight deadline</label>
              <input type="date" className={inputCls} value={form.insight_deadline} onChange={e => set('insight_deadline', e.target.value)} />
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>👤 Responsible</label>
              <input className={inputCls} value={form.responsible} onChange={e => set('responsible', e.target.value)} placeholder="Name" />
            </div>
            <div>
              <label className={labelCls}>⭐ Idea score (1–10)</label>
              <input type="number" min={1} max={10} className={inputCls} value={form.idea_score} onChange={e => set('idea_score', e.target.value)} placeholder="7" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>📁 Project</label>
              <select className={inputCls} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— All projects —</option>
                {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>🏷️ Campaign context</label>
              <input className={inputCls} value={form.campaign_context} onChange={e => set('campaign_context', e.target.value)} placeholder="e.g. May retargeting" />
            </div>
          </div>

          {/* D — Data / result */}
          <div>
            <label className={labelCls}>📊 Result / Data</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="What did the data show?"
              value={form.result}
              onChange={e => set('result', e.target.value)}
            />
          </div>

          {/* I — Insight */}
          <div>
            <label className={labelCls}>💡 Insight</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="What did you learn?"
              value={form.insight}
              onChange={e => set('insight', e.target.value)}
            />
          </div>

          {/* Status + Success */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>🔄 Status</label>
              <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>✅ Outcome</label>
              <select className={inputCls} value={form.success === null || form.success === '' ? '' : String(form.success)} onChange={e => set('success', e.target.value)}>
                <option value="">— No verdict —</option>
                <option value="true">Success ✅</option>
                <option value="false">Failed ❌</option>
              </select>
            </div>
          </div>

        </form>

        {/* footer */}
        <div className="px-6 py-4 border-t border-stone-100 flex items-center gap-3 shrink-0">
          <button
            type="submit"
            form="hadi-form"
            disabled={saving}
            className="flex-1 bg-stone-900 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-stone-800 disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Create hypothesis'}
          </button>
          {initial?.id && onDelete && (
            <button
              onClick={() => { onDelete(initial.id); onClose(); }}
              className="px-4 py-2.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
