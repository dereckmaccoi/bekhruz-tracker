# Batch 6 — PIN Protection

**Date:** 2026-05-07
**Status:** Approved

---

## Concept
A simple 4-digit PIN gate that protects the app from casual viewing.
Shown on first app load (or after a hard refresh). Once entered correctly,
the app is accessible for the rest of the browser session without re-asking.

No backend changes. PIN lives in `localStorage`. Session state lives in-memory.

---

## Component: `PinGate.jsx`

New file: `client/src/components/PinGate.jsx`

### Behavior
1. On mount: read PIN from `localStorage.getItem('app_pin')` and session flag from a module-level variable
2. If no PIN is set → show **setup screen** (set a new PIN, confirm it)
3. If PIN is set but session not unlocked → show **enter PIN screen**
4. If session is unlocked → render `{children}` directly

### Session flag
Use a module-level variable (not useState, not localStorage) so it survives re-renders but resets on hard refresh:

```js
let sessionUnlocked = false;
```

### Setup screen
- Title: "Set a PIN"
- Two inputs: "Enter PIN" + "Confirm PIN" (type="password", maxLength=4, pattern="[0-9]*", inputMode="numeric")
- Button: "Set PIN"
- Validation: both fields must match and be exactly 4 digits
- On success: `localStorage.setItem('app_pin', pin)`, set `sessionUnlocked = true`, re-render

### Enter PIN screen
- Title: "Enter PIN"
- One input (type="password", maxLength=4, inputMode="numeric")
- Button: "Unlock"
- On correct PIN: set `sessionUnlocked = true`, re-render
- On wrong PIN: show "Incorrect PIN" in red, clear input
- Small link below: "Forgot PIN? Reset" → clears localStorage pin, shows setup screen

### UI style
- Full-screen centered card, dark background matching app (`bg-[#0E0E0E]`)
- Card: `bg-[#1A1A1A] rounded-2xl p-8 w-80 flex flex-col gap-4`
- Input: same style as existing inputs in the app (border, rounded, dark)
- Primary button: `bg-[#1D9E75]` (green, matches app accent)
- Subtle secondary text for "Forgot PIN" link

---

## Integration

In `client/src/App.jsx`, wrap the entire router output:

```jsx
import PinGate from './components/PinGate';

// Inside App:
return (
  <PinGate>
    <Router>
      ...existing routes...
    </Router>
  </PinGate>
);
```

---

## Files to change
| File | Change |
|------|--------|
| `client/src/components/PinGate.jsx` | Create new file |
| `client/src/App.jsx` | Wrap router in `<PinGate>` |

No database changes. No API changes. No backend changes.
