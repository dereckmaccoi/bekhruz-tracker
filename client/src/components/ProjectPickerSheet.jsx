import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function ProjectPickerSheet({ open, onClose, projects }) {
  const navigate = useNavigate();

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const pick = (id) => {
    navigate(`/project/${id}`);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-60 bg-white rounded-t-2xl shadow-xl transition-transform duration-200 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stone-200" />
        </div>

        <div className="px-4 pb-6 pt-2">
          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest px-2 mb-3">
            Projects
          </p>
          <div className="space-y-1">
            {projects.map(p => (
              <button
                type="button"
                key={p.id}
                onClick={() => pick(p.id)}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-stone-50 active:bg-stone-100 transition-colors text-left"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="font-medium text-stone-900 text-sm">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
