import { useState } from 'react';

// Module-level: survives re-renders, resets on page refresh
let sessionUnlocked = false;

const PIN_KEY = 'app_pin';

function InputRow({ value, onChange, onKeyDown, autoFocus }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      maxLength={4}
      placeholder="• • • •"
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      className="w-full text-center text-2xl tracking-[0.5em] font-bold border border-stone-200 bg-stone-900 text-white rounded-xl px-4 py-3 outline-none focus:border-stone-500 transition-colors placeholder:text-stone-600 placeholder:tracking-widest"
    />
  );
}

export default function PinGate({ children }) {
  const storedPin = localStorage.getItem(PIN_KEY);
  const [unlocked, setUnlocked] = useState(sessionUnlocked);
  const [screen, setScreen]     = useState(storedPin ? 'enter' : 'setup');
  const [pin1, setPin1]         = useState('');
  const [pin2, setPin2]         = useState('');
  const [enterPin, setEnterPin] = useState('');
  const [error, setError]       = useState('');

  if (unlocked) return children;

  const unlock = () => {
    sessionUnlocked = true;
    setUnlocked(true);
  };

  const handleSetPin = () => {
    if (pin1.length !== 4) { setError('PIN must be exactly 4 digits.'); return; }
    if (pin1 !== pin2)     { setError('PINs do not match.'); return; }
    localStorage.setItem(PIN_KEY, pin1);
    setError('');
    unlock();
  };

  const handleEnterPin = () => {
    const stored = localStorage.getItem(PIN_KEY);
    if (enterPin === stored) {
      setError('');
      unlock();
    } else {
      setError('Incorrect PIN. Try again.');
      setEnterPin('');
    }
  };

  const handleForgotPin = () => {
    localStorage.removeItem(PIN_KEY);
    setPin1(''); setPin2(''); setEnterPin(''); setError('');
    setScreen('setup');
  };

  const onKeyDown = (handler) => (e) => { if (e.key === 'Enter') handler(); };

  return (
    <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center px-4">
      <div className="bg-[#1A1A1A] rounded-2xl p-8 w-80 flex flex-col gap-4 shadow-2xl border border-stone-800">
        {/* Logo */}
        <div className="text-center mb-1">
          <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-lg font-bold">T</span>
          </div>
          <h1 className="text-white font-bold text-lg tracking-tight">Tracker</h1>
          <p className="text-stone-500 text-xs mt-0.5">
            {screen === 'setup' ? 'Create a PIN to protect your data' : 'Enter your PIN to continue'}
          </p>
        </div>

        {screen === 'setup' ? (
          <>
            <div className="space-y-2">
              <label className="text-xs text-stone-500 font-medium uppercase tracking-wide">New PIN</label>
              <InputRow value={pin1} onChange={setPin1} onKeyDown={onKeyDown(() => {})} autoFocus />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-stone-500 font-medium uppercase tracking-wide">Confirm PIN</label>
              <InputRow value={pin2} onChange={setPin2} onKeyDown={onKeyDown(handleSetPin)} />
            </div>
            {error && <p className="text-[#E24B4A] text-xs text-center">{error}</p>}
            <button
              onClick={handleSetPin}
              disabled={pin1.length !== 4 || pin2.length !== 4}
              className="w-full py-3 bg-[#1D9E75] text-white font-semibold rounded-xl hover:bg-[#179065] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Set PIN
            </button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-xs text-stone-500 font-medium uppercase tracking-wide">PIN</label>
              <InputRow value={enterPin} onChange={setEnterPin} onKeyDown={onKeyDown(handleEnterPin)} autoFocus />
            </div>
            {error && <p className="text-[#E24B4A] text-xs text-center">{error}</p>}
            <button
              onClick={handleEnterPin}
              disabled={enterPin.length !== 4}
              className="w-full py-3 bg-[#1D9E75] text-white font-semibold rounded-xl hover:bg-[#179065] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Unlock
            </button>
            <button
              onClick={handleForgotPin}
              className="text-xs text-stone-600 hover:text-stone-400 text-center underline transition-colors"
            >
              Forgot PIN? Reset
            </button>
          </>
        )}
      </div>
    </div>
  );
}
