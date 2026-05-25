import { useState } from 'react';

// ── Stations: continuous long-form streams ────────────────────────────
const STATIONS = [
  { label: 'Lofi Hip Hop', id: 'jfKfPfyJRdk' },
  { label: 'Deep Focus',   id: '5qap5aO4i9A' },
  { label: 'Jazz Cafe',    id: 'HuFYqnbVbzY' },
  { label: 'Chillhop',     id: '7NOSDKb0HlU' },
  { label: 'Dark Lofi',    id: 'S_MOd40zlYU' },
  { label: 'Phonk 🔥',    id: 'ZQAGh6L4jjs' },
  { label: 'Hard Phonk',   id: '_xUxFLEP6gc' },
  { label: 'Dark Aura',    id: 'M0HqpoKhAgM' },
];

// ── My Playlist: individual tracks ───────────────────────────────────
const TRACKS = [
  { label: 'Confess Your Love', artist: 'Laufey', id: 'WR71hlmg7yI' },
];

const TABS = ['Stations', 'Playlist'];

export default function MusicPlayer() {
  const [open, setOpen]             = useState(false);
  const [visible, setVisible]       = useState(true);
  const [tab, setTab]               = useState(1);       // start on Playlist
  const [stationIdx, setStationIdx] = useState(0);
  const [trackIdx, setTrackIdx]     = useState(0);       // Confess Your Love
  // Muted autoplay: browsers allow it immediately, user unmutes with one tap.
  const [muted, setMuted]           = useState(true);
  const [autoDiscover, setAutoDiscover] = useState(true); // let YouTube suggest next songs

  const current = tab === 0 ? STATIONS[stationIdx] : TRACKS[trackIdx];

  // In auto-discover mode: no explicit playlist — YouTube shows its own "Up Next"
  // recommendations after the track ends, discovering similar songs automatically.
  // In normal mode: circular queue loops through the fixed playlist.
  const playlistParam = tab === 1 && !autoDiscover
    ? [...TRACKS.slice(trackIdx), ...TRACKS.slice(0, trackIdx)].map(t => t.id).join(',')
    : current.id;

  const iframeSrc = `https://www.youtube-nocookie.com/embed/${current.id}`
    + `?autoplay=1`
    + (tab === 1 && autoDiscover
        ? `&list=RD${current.id}&listType=playlist` // YouTube Radio mix — autoplays similar songs
        : `&loop=1&playlist=${playlistParam}`)       // our fixed playlist loops
    + `&controls=1&modestbranding=1`
    + (muted ? '&mute=1' : '');

  const prev = () => {
    if (tab === 0) setStationIdx(i => (i - 1 + STATIONS.length) % STATIONS.length);
    else           setTrackIdx(i   => (i - 1 + TRACKS.length)   % TRACKS.length);
  };
  const next = () => {
    if (tab === 0) setStationIdx(i => (i + 1) % STATIONS.length);
    else           setTrackIdx(i   => (i + 1) % TRACKS.length);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1 select-none">

      {/* ── Panel: always in the DOM so the iframe keeps playing when closed.
           height:0 + overflow:hidden collapses it visually without
           triggering an iframe unmount (unlike conditional rendering). ── */}
      <div style={open
        ? {}
        : { height: 0, overflow: 'hidden', pointerEvents: 'none' }
      }>
        <div className="bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden w-72">

          {/* YouTube iframe — key changes only on track/mute switch, never on open/close */}
          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
            <iframe
              key={`${current.id}|${muted}`}
              className="absolute inset-0 w-full h-full"
              src={iframeSrc}
              title={current.label}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>

          {/* Unmute banner */}
          {muted && (
            <button
              onClick={() => setMuted(false)}
              className="w-full flex items-center justify-center gap-2 py-1.5 bg-amber-50 border-b border-amber-100 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
            >
              🔇 Playing muted — tap to unmute
            </button>
          )}

          {/* Tabs */}
          <div className="flex border-b border-stone-100">
            {TABS.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                  tab === i
                    ? 'border-b-2 border-stone-800 text-stone-800'
                    : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Stations list */}
          {tab === 0 && (
            <div className="p-2 max-h-36 overflow-y-auto">
              <div className="flex flex-wrap gap-1">
                {STATIONS.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setStationIdx(i)}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                      i === stationIdx
                        ? 'bg-stone-800 text-white border-stone-800'
                        : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Track list */}
          {tab === 1 && (
            <div>
            <button
              onClick={() => setAutoDiscover(v => !v)}
              className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] border-b transition-colors ${
                autoDiscover
                  ? 'bg-stone-800 text-white border-stone-800'
                  : 'bg-stone-50 text-stone-500 border-stone-100 hover:bg-stone-100'
              }`}
            >
              <span>✨ Auto-discover similar songs</span>
              <span className="font-semibold">{autoDiscover ? 'ON' : 'OFF'}</span>
            </button>
            <div className="max-h-40 overflow-y-auto divide-y divide-stone-50">
              {TRACKS.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => setTrackIdx(i)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                    i === trackIdx ? 'bg-stone-50' : 'hover:bg-stone-50'
                  }`}
                >
                  <span className={`text-sm leading-none ${i === trackIdx ? 'opacity-100' : 'opacity-0'}`}>▶</span>
                  <div className="min-w-0">
                    <p className={`text-xs font-medium truncate ${i === trackIdx ? 'text-stone-900' : 'text-stone-600'}`}>
                      {t.label}
                    </p>
                    <p className="text-[10px] text-stone-400">{t.artist}</p>
                  </div>
                </button>
              ))}
            </div>
            </div>
          )}

          {/* Prev / Now playing / Next */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-stone-100">
            <button onClick={prev} className="text-stone-400 hover:text-stone-700 text-sm px-1">‹</button>
            <p className="text-[11px] text-stone-500 text-center truncate flex-1 px-1">
              {tab === 1 && <span className="text-stone-400">{TRACKS[trackIdx].artist} · </span>}
              <span className="font-medium text-stone-700">{current.label}</span>
            </p>
            <button onClick={next} className="text-stone-400 hover:text-stone-700 text-sm px-1">›</button>
          </div>
        </div>
      </div>

      {/* ── Toggle button row ── */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setVisible(false)}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-stone-200 text-stone-400 hover:bg-stone-300 text-xs"
          title="Hide player"
        >
          ✕
        </button>

        <button
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-md text-sm font-medium transition-colors ${
            open
              ? 'bg-stone-800 text-white'
              : 'bg-white border border-stone-200 text-stone-600 hover:border-stone-400'
          }`}
        >
          <span>{muted ? '🔇' : '🎵'}</span>
          <span>{open ? current.label : current.label}</span>
          <span className="text-xs opacity-50">{open ? '▼' : '▲'}</span>
        </button>
      </div>
    </div>
  );
}
