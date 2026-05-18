# Batch 6 — PIN Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A simple 4-digit PIN gate on the app. Shows a setup screen (first time) or enter-PIN screen (subsequent visits). Once entered correctly, PIN is not asked again for the rest of the browser session. PIN stored in localStorage.

**Architecture:** New `PinGate.jsx` component wraps the `<BrowserRouter>` in `App.jsx`. Uses a module-level variable for session state (persists through React re-renders but resets on page refresh). localStorage for the PIN itself.

**Tech Stack:** React 18, Tailwind CSS. Project root: `C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker`

---

## File Map

| File | Change |
|------|--------|
| `client/src/components/PinGate.jsx` | **Create** — full PIN gate component |
| `client/src/App.jsx` | Wrap router in `<PinGate>` |

---

### Task 1: Create PinGate Component

**Files:**
- Create: `client/src/components/PinGate.jsx`

**Background:** The component has two screens:
1. **Setup screen** — when no PIN exists in localStorage. Two inputs (enter PIN + confirm PIN). Validates both are 4 digits and match.
2. **Enter PIN screen** — when a PIN exists but the session isn't unlocked yet. One input. "Forgot PIN?" link resets to setup.

Session state is managed via a module-level variable (`let sessionUnlocked = false`) so it survives React re-renders but resets on hard page refresh.

- [ ] **Step 1: Create PinGate.jsx with full content**

Create `client/src/components/PinGate.jsx`:

```jsx
import { useState, useRef } from 'react';

// Module-level: survives re-renders, resets on page refresh
let sessionUnlocked = false;

const PIN_KEY = 'app_pin';

function InputRow({ value, onChange, onKeyDown, placeholder, autoFocus }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      maxLength={4}
      placeholder={placeholder || '• • • •'}
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
  const [unlocked, setUnlocked]       = useState(sessionUnlocked);
  const [screen, setScreen]           = useState(storedPin ? 'enter' : 'setup');
  const [pin1, setPin1]               = useState('');
  const [pin2, setPin2]               = useState('');
  const [enterPin, setEnterPin]       = useState('');
  const [error, setError]             = useState('');

  if (unlocked) return children;

  const unlock = () => {
    sessionUnlocked = true;
    setUnlocked(true);
  };

  const handleSetPin = () => {
    if (pin1.length !== 4) { setError('PIN must be exactly 4 digits.'); return; }
    if (pin1 !== pin2) { setError('PINs do not match.'); return; }
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
    setPin1('');
    setPin2('');
    setEnterPin('');
    setError('');
    setScreen('setup');
  };

  const onKeyDown = (handler) => (e) => {
    if (e.key === 'Enter') handler();
  };

  return (
    <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center px-4">
      <div className="bg-[#1A1A1A] rounded-2xl p-8 w-80 flex flex-col gap-4 shadow-2xl border border-stone-800">
        {/* Logo / App name */}
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
              <InputRow
                value={pin1}
                onChange={setPin1}
                onKeyDown={onKeyDown(() => {})}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-stone-500 font-medium uppercase tracking-wide">Confirm PIN</label>
              <InputRow
                value={pin2}
                onChange={setPin2}
                onKeyDown={onKeyDown(handleSetPin)}
              />
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
              <InputRow
                value={enterPin}
                onChange={setEnterPin}
                onKeyDown={onKeyDown(handleEnterPin)}
                autoFocus
              />
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
```

- [ ] **Step 2: Verify the file looks correct**

Review imports: only `useState` and `useRef` from React (useRef isn't actually used — remove it). The correct import is:
```js
import { useState } from 'react';
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/PinGate.jsx
git commit -m "feat: PinGate component with setup and enter-PIN screens"
```

---

### Task 2: Wrap App in PinGate

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Import PinGate**

In `client/src/App.jsx`, add the import:
```js
import PinGate from './components/PinGate.jsx';
```

- [ ] **Step 2: Wrap the router**

Find `export default function App()`:
```jsx
export default function App() {
  return (
    <LangProvider>
      <ProjectsProvider>
        <BrowserRouter>
          <AppInner />
        </BrowserRouter>
      </ProjectsProvider>
    </LangProvider>
  );
}
```

Wrap the inner content with `<PinGate>`. Place PinGate inside `<LangProvider>` so it can use translations if needed, but outside `<ProjectsProvider>` and `<BrowserRouter>` to gate the entire app:
```jsx
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
```

Note: if Batch 4 (ProjectsProvider) hasn't been implemented yet, the wrapping is simpler:
```jsx
export default function App() {
  return (
    <LangProvider>
      <PinGate>
        <BrowserRouter>
          <AppInner />
        </BrowserRouter>
      </PinGate>
    </LangProvider>
  );
}
```

- [ ] **Step 3: Test the setup flow**

Open the app in the browser. If no PIN is set yet, the PIN setup screen should appear (dark background, green "Set PIN" button). Set a 4-digit PIN. Confirm the app unlocks and shows the Dashboard.

- [ ] **Step 4: Test the enter-PIN flow**

Reload the page (hard refresh with Ctrl+Shift+R). The enter-PIN screen should appear. Enter the wrong PIN — confirm red error text and input clears. Enter the correct PIN — confirm the app unlocks.

- [ ] **Step 5: Test the forgot-PIN flow**

On the enter-PIN screen, click "Forgot PIN? Reset". Confirm the setup screen appears. Set a new PIN. Confirm the app unlocks.

- [ ] **Step 6: Test session persistence**

After unlocking, navigate between pages (Dashboard → Project → Workshop). Confirm PIN is not asked again. Soft navigate (don't refresh) should keep the app unlocked.

- [ ] **Step 7: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: wrap App in PinGate for session-scoped PIN protection"
```

---

## Build & Deploy

- [ ] **Build**
```bash
cd C:\Users\rusta\OneDrive\Рабочий стол\claudee\tracker\client
npm run build
```
Expected: no errors.

- [ ] **Deploy**
```bash
scp -r dist/. root@46.62.147.30:/home/bekhruz/tracker/client/dist/
```
