---
name: cs16-launcher-design
description: Design system v2 for cs16-launcher, a custom Counter-Strike 1.6 launcher (Electron + React + TypeScript) with Steam detection, content sync, and server browser. ALWAYS use this skill when creating, modifying, restyling, or reviewing ANY UI in the cs16-launcher project — windows, screens, buttons, server browser, progress indicators, settings, modals, empty states — even if the user just says "add a screen", "fix this component", or "make it look better" without mentioning design explicitly.
---

# CS16 Launcher — Design System v2 "Headshot"

## Design vision

A launcher people *want* to open. The emotional arc: open the app → see gorgeous hero art → one glowing PLAY button → in the game within 5 seconds. Everything else (servers, sync, settings) is a quiet, ultra-fast control panel around that moment.

Direction: **"Tactical premium"** — the cold, competitive soul of CS 1.6 executed with 2026 polish. Think esports broadcast graphics meets a well-built tool: hero-first layout, HUD-style accents, motion that communicates state instead of decorating, and data surfaces (server browser) that are raw, schematic, and brutally clear — a control panel, not a brochure.

Three laws, in priority order:
1. **Speed is the aesthetic.** Nothing may feel slower than native. Animations ≤200ms, skeletons over spinners, optimistic UI everywhere.
2. **One hero per screen.** Home = PLAY button. Servers = the table. Settings = the controls. Everything else recedes.
3. **Motion explains.** Every animation must communicate a state change (syncing, connecting, refreshed). If it doesn't explain anything — delete it.

## Color tokens

```css
:root {
  /* Base — cold gunmetal with a green shift. Never pure gray. */
  --cs-bg-0: #0d100e;      /* window root */
  --cs-bg-1: #141815;      /* main surfaces, sidebar */
  --cs-bg-2: #1c221e;      /* cards, rows, inputs */
  --cs-bg-3: #262e28;      /* hover, active nav */
  --cs-overlay: rgba(13, 16, 14, 0.72); /* glass layer over hero art ONLY */

  /* Text */
  --cs-text-hi:  #ecefe9;
  --cs-text-mid: #9aa396;
  --cs-text-low: #5a635a;

  /* Signature accent — HUD olive-yellow (CS-era radar/HUD color, modernized) */
  --cs-accent:       #cfe04f;
  --cs-accent-hover: #e0f068;
  --cs-accent-press: #b8c840;
  --cs-accent-dim:   rgba(207, 224, 79, 0.12);
  --cs-accent-glow:  rgba(207, 224, 79, 0.25); /* PLAY button glow only */

  /* Semantic (HUD language) */
  --cs-ok:     #62c46e;   /* low ping, synced, online */
  --cs-warn:   #e3aa3d;   /* mid ping, update available */
  --cs-danger: #e25549;   /* high ping, errors, close btn hover */
  --cs-info:   #6fa9c9;   /* downloads, neutral progress */

  --cs-border: rgba(236, 239, 233, 0.07);

  /* Elevation (floating elements only) */
  --cs-shadow-pop:   0 8px 24px rgba(0,0,0,0.45);
  --cs-shadow-modal: 0 16px 48px rgba(0,0,0,0.6);
}
```

Rules:
- Depth = background tier, not shadows. Shadows only on popovers/modals/toasts.
- Glass (`--cs-overlay` + `backdrop-filter: blur(12px)`) is allowed **only** as a panel floating over hero artwork on the Home screen. Never on flat surfaces — that's decoration, not depth.
- Accent budget: max 3 olive elements visible at once. Semantic colors appear only on the data they describe (ping number, status dot), never on whole rows.
- Glow (`--cs-accent-glow`) exists for exactly one element: the PLAY button.

## Typography

- **Display**: `Saira Condensed` 600–700, uppercase, `letter-spacing: 0.05em`. For: PLAY, page titles, hero server name, stat numbers.
- **UI/body**: `Inter` 13–14px, weights 400/500.
- **Data**: `JetBrains Mono` 12px, `tabular-nums` — ping, players, IP:port, speeds, timers. Numbers must NEVER jitter or shift layout when updating.
- Type scale: 11 (uppercase labels) / 12 / 13 / 14 / 18 / 24 / 40 (hero).

## Layout & shell

- Frameless window, custom titlebar 36px: app mark left, drag region, window controls right (12px lucide icons, 40px hit areas, close hover = `--cs-danger` bg). Min window 1024×640.
- **Sidebar 220px**, collapsible to 56px icon rail (state persisted): Home, Servers, Content, Settings. Items 38px, 16px lucide icons, active = `--cs-bg-3` + 2px olive left bar. Bottom of sidebar: Steam status chip (detected ✓ / not found ⚠ with fix link) and app version.
- Spacing scale 4/8/12/16/24/32. Radius: 8px hero cards, 6px cards/modals, 4px buttons/inputs, 999px dots & pills only.
- Content area max-width 1280px, centered on wide windows.

## Home screen — the hero moment

- Full-bleed **hero backdrop**: original dark tactical artwork or de_dust-*inspired* palette texture (sand/olive tones, original art only — never actual game assets), slow 30s Ken Burns drift (disabled under reduced motion), vignette bottom 40%.
- Bottom-left over the art, on a glass panel: game title in display type, version + sync status line, then the PLAY row.
- **Quick-connect card** bottom-right: "Last server" with name, map, ping, players + one-click CONNECT. This is the retention feature — regulars live here.
- Optional stat strip under hero (mono numbers, 11px uppercase labels): hours played · favorite map · servers visited. Numbers count up 400ms on first paint only.

## The PLAY button — signature element

- 200×52px, olive bg, `#10130e` text, display font 700 uppercase 18px, radius 4px, subtle `box-shadow: 0 0 24px var(--cs-accent-glow)`.
- Hover: `--cs-accent-hover`, translateY(-1px), glow +30%, 120ms. Press: `--cs-accent-press`, translateY(0).
- **State machine rendered inside the button** (never a separate progress bar for the main flow):
  - `PLAY` → idle olive
  - `UPDATE` → `--cs-warn` bg
  - `SYNCING 47%` → darker track, olive fill sweeping left→right, mono % right-aligned; fill moves in real progress, no fake easing
  - `LAUNCHING…` → soft pulse (1.5s), disabled
  - Steam missing → disabled `--cs-bg-3`, tooltip explains, "Locate Steam…" link beneath
- Errors surface as a toast + button returns to actionable state. The button never dead-ends.

## Server browser — the control panel

Raw, schematic, instant. Zero decoration.
- Sticky toolbar: search (lucide `search`, filters as it types, `/` focuses it), filter chips (Not full · Not empty · No password · Favorites), refresh button (icon spins 500ms/turn linear while fetching).
- Rows 34px virtualized (hundreds of servers, zero lag): status dot · favorite star · name · map · players `18/32` (mono) · ping (mono, `<50` ok / `50–120` warn / `>120` danger) · lock icon.
- Hover → `--cs-bg-2`. Selected → `--cs-accent-dim` + 2px olive left bar. Double-click = connect. Enter = connect. Right-click: Connect / Copy IP / Favorite / Server info.
- Sortable headers (11px uppercase `--cs-text-mid`, olive sort arrow). Favorites pinned top.
- Ping updates: 150ms color tween, no layout shift. New rows on refresh: 100ms fade-in, no slide.
- Server info opens a right-side **drawer** (360px, 200ms slide): map thumbnail placeholder, player list (mono), connect history sparkline. Not a modal — keep the table visible.
- Empty state: crosshair lucide icon, one line, Refresh button. Failed state: what went wrong + Retry. Never blame the user, never apologize, never emoji.

## Content sync screen

- Per-item rows: name, size (mono), 4px olive progress bar, speed `12.4 MB/s` (mono, right). Active item on top.
- Global summary card: total progress ring (44px, olive) + ETA (mono). The ring is the only circular progress in the app.
- Verify/repair action with a confirm step. Errors are specific ("Checksum failed: de_dust2.wad — Retry").

## Command palette — power-user plush

`Ctrl+K`: fuzzy actions — connect to server by name, toggle settings, open folders, "Verify files". Modal 560px, glass over dim overlay, mono hints, first result preselected, Enter executes. This single feature makes the launcher feel 2026.

## Micro-interactions catalog

1. Page transitions: 120ms fade + 4px rise. Nothing above 200ms anywhere.
2. Status dots 8px: pulse (2s scale 1→1.4 fade) **only** for live/connected states.
3. Tooltips: 300ms delay, `--cs-bg-3`, 11px, shortcuts right-aligned in `--cs-text-low`.
4. Toasts bottom-right: `--cs-bg-2`, olive/semantic 2px left border, 6px radius, auto-dismiss 4s, hover pins, max 3 stacked.
5. Toggle switches 36×20px, olive when on, thumb 120ms.
6. Skeletons (`--cs-bg-2`, faint shimmer) for server list & news on first load; content pops in without reflow.
7. Optimistic UI: favoriting, settings toggles apply instantly, reconcile in background, toast on failure.
8. Keyboard first: full tab order, 1px olive focus outline (1px offset) always visible, `F5` refresh servers, `Ctrl+,` settings.
9. `prefers-reduced-motion` + in-app "Reduce motion" setting: kills Ken Burns, pulses, shimmers, count-ups. Non-negotiable — ships in v1 of any screen.
10. Optional subtle UI sounds (off by default): connect blip, sync-done tick. Settings toggle.

## Component recipes

- **Secondary button**: `--cs-bg-2`, 32px, hover `--cs-bg-3`.
- **Ghost/danger buttons**: transparent → tinted hover; danger text `--cs-danger`.
- **Inputs**: `--cs-bg-2`, borderless at rest, 1px olive focus border, 30px.
- **Tabs**: condensed uppercase 12px, active = `--cs-text-hi` + 2px olive underline, 120ms underline slide between tabs.
- **Settings rows**: label + 12px `--cs-text-mid` description left, control right; grouped cards with 11px uppercase section headers.
- **Modals**: 6px radius, `--cs-bg-1`, 480px, overlay `rgba(0,0,0,0.6)`, 150ms fade+scale(0.98→1), Esc closes.
- **News cards** (if feed exists): 16:9 original art, condensed uppercase title, hover: tier raise + image scale 1.03/200ms.

## Hard don'ts

- No Valve/Steam logos, fonts, textures, or trade dress. Era-*inspired* originals only.
- No pure #000/#fff. No neon RGB gradients, no rainbow glow, no neumorphism.
- Glass only over hero art. No animation >200ms. No spinners where a skeleton fits.
- No emoji in UI. No radius >8px except dots/pills. Semantic color never fills whole rows.
- The PLAY button is the only glowing element. Ever.

## Verification

After UI changes: `npm run typecheck` + `electron-vite build`. Manually check: frameless drag region + titlebar on Linux/KDE and Windows; server list with 500+ mock rows stays 60fps; every screen at 1024×640; tab-through with keyboard; reduced-motion mode.
