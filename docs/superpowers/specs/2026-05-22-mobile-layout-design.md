# Mobile Layout Redesign — Design Spec

**Date:** 2026-05-22
**Scope:** Bekhruz Performance Tracker — Telegram Mini App mobile UX

---

## Problem

The app opens as a Telegram Mini App on mobile phones but renders a desktop layout:
- A permanent 224px-wide sidebar (`Sidebar.jsx`) consumes most of the screen
- On a 375px phone only ~150px is left for content
- `HadiPage` uses a multi-column `<table>` that is unusable on touch screens

## Approved Approach

**Option A — Bottom tab bar, sidebar removed entirely.**

Since the app is exclusively used inside Telegram Mini App (always mobile), there is no need to carry the sidebar. A fixed 4-tab bottom nav replaces it. HADI Board table is replaced with mobile cards.

---

## Architecture

### App Shell (`App.jsx` / `AppInner`)

**Before:**
```
flex h-screen (horizontal)
  <Sidebar />          ← 224px fixed
  <main flex-1 />
```

**After:**
```
flex flex-col h-screen (vertical)
  [offline banner — fixed top]
  <main flex-1 overflow-y-auto pb-20 />   ← pb-20 clears bottom nav
  <BottomNav />                           ← fixed bottom
  <QuickEntry />                          ← unchanged float
  <MusicPlayer />                         ← unchanged float
```

`Sidebar.jsx` is **deleted** from the component tree (import and usage removed from `App.jsx`).

### `BottomNav.jsx` — New Component

**File:** `client/src/components/BottomNav.jsx`

4 tabs, fixed to bottom, respects safe-area-inset:

| Tab      | Icon | Route / Behaviour |
|----------|------|-------------------|
| Home     | 📊   | `/dashboard`      |
| Projects | 📁   | Opens `ProjectPickerSheet` |
| HADI     | 🚀   | `/hadi`           |
| Workshop | 🔧   | `/workshop`       |

- Active tab: icon + label highlighted (stone-900 color)
- Inactive: stone-400
- Projects tab is considered active whenever the current path starts with `/project/`
- Height: `h-16` + `pb-[env(safe-area-inset-bottom)]`
- Background: white, `border-t border-stone-100`, `shadow-[0_-1px_0_0_#e7e5e0]`
- Lang switcher (previously in sidebar bottom) moves to the Dashboard header area

### `ProjectPickerSheet.jsx` — New Component

**File:** `client/src/components/ProjectPickerSheet.jsx`

Slide-up bottom sheet triggered by tapping the Projects tab. Contains 4 project rows:

```
┌──────────────────────────────────┐
│   ─────  (drag handle)           │
│                                  │
│  ● TSB           (red dot)       │
│  ● Full Contact  (green dot)     │
│  ● Milliard Club (purple dot)    │
│  ● Sales Doctor  (amber dot)     │
│                                  │
└──────────────────────────────────┘
```

- Tapping a project navigates to `/project/:id` and closes the sheet
- Sheet slides in from bottom with a CSS transition (`translate-y-full` → `translate-y-0`)
- Backdrop overlay (semi-transparent black) closes the sheet on tap
- No external animation library — pure Tailwind + inline CSS transition

### HADI Board — Mobile Card Layout

**File:** `client/src/components/HadiPage.jsx` (modified)

The `<table>` / `<tbody>` structure is replaced with a card list per group. Each card:

```
┌──────────────────────────────────────────┐
│  [● ProjectName] [Status badge] [Date]   │
│  Hypothesis title (line-clamp-2)         │
│  👤 Responsible (if present)            │
│                              [Edit ✏️]  │
└──────────────────────────────────────────┘
```

- Groups (by `campaign_context`) retain their section header with item count badge
- Stats bar (donut chart + counters) unchanged — already renders fine on mobile
- Filter row: search input + status/project selects wrap to two lines on small screens (`flex-wrap`)
- "New hypothesis" button moves to sit next to the page title (already `flex justify-between`)

### `index.html` — Viewport Fix

Add `viewport-fit=cover` to the `<meta name="viewport">` tag so `env(safe-area-inset-bottom)` works correctly on iOS devices with home indicator:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

### Lang Switcher Relocation

The EN/RU/UZ switcher was in the sidebar bottom. It moves to the **Dashboard page header** as a compact row of 3 pill buttons (same visual style as now). On other pages (Project, HADI, Workshop) the lang switcher is not shown — users set it on the Dashboard.

---

## Data Flow

No server-side changes. All changes are purely frontend layout and component restructuring. The routing (`BrowserRouter`, `Routes`) is unchanged — only the navigation UI changes.

---

## Components Changed / Created

| File | Action | What changes |
|------|--------|--------------|
| `client/src/components/Sidebar.jsx` | **Delete** | Entire file removed |
| `client/src/App.jsx` | **Modify** | Remove Sidebar import/usage; change shell from horizontal to vertical flex; add BottomNav |
| `client/src/components/BottomNav.jsx` | **Create** | New 4-tab bottom navigation bar |
| `client/src/components/ProjectPickerSheet.jsx` | **Create** | Slide-up project selector sheet |
| `client/src/components/HadiPage.jsx` | **Modify** | Replace table rows with cards |
| `client/src/components/Dashboard.jsx` | **Modify** | Add lang switcher to header area |
| `client/index.html` | **Modify** | Add `viewport-fit=cover` |

---

## Error Handling

- `ProjectPickerSheet` closes on Escape key (for future desktop/keyboard use)
- If no project is active in the Projects tab, the sheet opens showing all 4 projects equally
- All touch targets are minimum 44×44px (WCAG AA touch target guideline)

---

## Out of Scope

- `ProjectPage.jsx`, `Workshop/index.jsx`, `QuickEntry.jsx`, `MusicPlayer.jsx`, `HadiPanel.jsx` — no layout changes (they are page-level content, not shell)
- Dark mode
- Responsive breakpoints for wide screens (not needed for Telegram Mini App)
- `Sidebar.jsx` is deleted as part of this change (already listed in the components table above)
