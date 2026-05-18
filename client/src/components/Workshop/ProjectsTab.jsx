import { useState } from 'react';
import { useProjects } from '../../context/ProjectsContext.jsx';

const PRESET_COLORS = [
  '#E24B4A', '#1D9E75', '#7F77DD', '#BA7517',
  '#2E86AB', '#F04E98', '#6B7280', '#059669',
];

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full transition-all ${value === c ? 'ring-2 ring-offset-1 ring-stone-500 scale-110' : 'hover:scale-110'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function ProjectRow({ project, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0">
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: project.color || '#888' }} />
        <span className="text-sm font-medium text-stone-800">{project.name}</span>
        <span className="text-xs text-stone-400 font-mono">{project.id}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit(project)}
          className="text-xs text-stone-400 hover:text-stone-700 underline"
        >
          Edit
        </button>
        {confirmDelete ? (
          <>
            <span className="text-xs text-red-600">Delete?</span>
            <button
              onClick={() => onDelete(project.id)}
              className="text-xs text-red-600 hover:text-red-800 font-semibold"
            >Yes</button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-stone-400 hover:text-stone-600"
            >No</button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-stone-300 hover:text-red-500 underline"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function ProjectForm({ initial, onSave, onCancel, saving }) {
  const [name, setName]   = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || PRESET_COLORS[0]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), color });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
      <div>
        <label className="text-xs text-stone-500 font-medium uppercase tracking-wide block mb-1">Name</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Project name…"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
      </div>
      <div>
        <label className="text-xs text-stone-500 font-medium uppercase tracking-wide block mb-2">Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="px-4 py-1.5 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : (initial ? 'Update' : 'Add Project')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 bg-stone-100 text-stone-600 text-sm rounded-lg hover:bg-stone-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ProjectsTab() {
  const { projects, createProject, updateProject, deleteProject } = useProjects();
  const [adding, setAdding]       = useState(false);
  const [editing, setEditing]     = useState(null); // project object
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const handleCreate = async (body) => {
    setSaving(true); setError('');
    try {
      await createProject(body);
      setAdding(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (body) => {
    setSaving(true); setError('');
    try {
      await updateProject(editing.id, body);
      setEditing(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setSaving(true); setError('');
    try {
      await deleteProject(id);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">Projects</h2>
          {!adding && !editing && (
            <button
              onClick={() => setAdding(true)}
              className="text-xs bg-stone-800 text-white px-3 py-1.5 rounded-lg hover:bg-stone-700"
            >
              + Add Project
            </button>
          )}
        </div>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        {adding && (
          <div className="mb-4">
            <ProjectForm
              onSave={handleCreate}
              onCancel={() => setAdding(false)}
              saving={saving}
            />
          </div>
        )}

        {projects.length === 0 && !adding ? (
          <p className="text-sm text-stone-400">No projects yet. Add one above.</p>
        ) : (
          projects.map(p => (
            editing?.id === p.id ? (
              <div key={p.id} className="mb-3">
                <ProjectForm
                  initial={p}
                  onSave={handleUpdate}
                  onCancel={() => setEditing(null)}
                  saving={saving}
                />
              </div>
            ) : (
              <ProjectRow
                key={p.id}
                project={p}
                onEdit={setEditing}
                onDelete={handleDelete}
              />
            )
          ))
        )}
      </div>
    </div>
  );
}
