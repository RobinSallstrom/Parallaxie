# Parallaxie CEP panel

The After Effects panel for the Parallaxie engine. Scaffolded with
bolt-cep 2.2.3 (React + TypeScript + Vite, AEFT only); design contract in
`../docs/PANEL_SPEC.md`, platform facts in `../docs/CEP_NOTES.md`, engine
API in `../docs/API_DISPATCHER.md`.

The panel is a skin over `$.global.PXE`: every mutation and computation
happens in the engine (`../Parallaxie_v1.jsx`) through the JSON dispatcher
`PXE.call`. The panel adds zero scene logic and never re-implements engine
math (bands and coverage are displayed, never computed here).

## Layout

```
cep.config.ts                     manifest/build config (AEFT [22.0,99.9], CSXS 9.0 floor)
src/js/types/pxe.ts               dispatcher contract types (PXEResult, SceneModel, ...)
src/js/types/depth-graph.ts       FROZEN props contract for the depth graph component
src/js/lib/pxe/bridge.ts          the one evalScript seam: pxeCall(), channels,
                                  drag protocol (12 Hz, one undo group, watchdog)
src/js/lib/pxe/mock.ts            browser-mode mock PXE (6-plane scene from the spec)
src/js/main/main.tsx              app shell: Build / Depth / Move / Utilities / Console
src/js/main/components/           Console, ConfirmButton,
                                  DepthGraph/ (the depth graph, PANEL_SPEC sec. 5),
                                  DepthGraphPlaceholder (superseded fallback, unused)
src/jsx/aeft/aeft.ts              ExtendScript shim: loads the engine, forwards PXE.call,
                                  undo-group helpers. Does NOT duplicate the engine.
```

## Dev loop

### A. Plain browser (no After Effects) -- mock mode

```
npm install
npm run dev
```

Open `http://localhost:3000/main/`. `window.__adobe_cep__` is absent, so the
bridge automatically serves the mock (`src/js/lib/pxe/mock.ts`): the 6-plane
`HERO_SHOT_v3` scene, 80-200 ms artificial latency, and a dev strip at the
top of the panel to switch preflight results (clean / warnings / blocked)
and force an error or a timeout. Mutations mutate the mock scene, so the
optimistic-update and reconciliation paths run without AE.

### B. Inside After Effects -- debug mode

1. Enable PlayerDebugMode (once per dev machine, both CEP runtimes --
   AE 22-24 run CEP 11, AE 25+ runs CEP 12):
   - Windows: under `HKEY_CURRENT_USER\Software\Adobe\CSXS.11` **and**
     `...\CSXS.12`, add String value `PlayerDebugMode` = `1`.
   - macOS: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` and
     `defaults write com.adobe.CSXS.12 PlayerDebugMode 1`
     (then `killall cfprefsd` if it does not take effect).
2. `npm run build` once -- this also symlinks `dist/cep` into the CEP
   extensions folder so AE can find the panel.
3. `npm run dev`, start After Effects, open
   Window > Extensions > Parallaxie. The panel is served with HMR from
   `localhost:3000/main/`.
4. Debug: `http://localhost:8860` in a Chromium browser (port from
   `startingDebugPort` in `cep.config.ts`), or use normal DevTools against
   the localhost:3000 page. Panel `console.log` output appears there, not in AE.

Engine loading in dev: on the first engine call the bridge asks the
ExtendScript shim to `$.evalFile()` the engine. The path defaults to
`C:/Projects/Parallaxie/Parallaxie_v1.jsx` (see `DEV_ENGINE_PATH` in
`src/js/lib/pxe/bridge.ts`); override it without rebuilding by setting
localStorage key `pxe.enginePath` in the panel's DevTools console, e.g.
`localStorage.setItem("pxe.enginePath", "/Users/you/Parallaxie/Parallaxie_v1.jsx")`.
If the engine is already loaded in the session (e.g. you ran the smoke
suite), the shim detects `$.global.PXE` and skips the file load.

## Build and package

- `npm run build` -- type-check + production build to `dist/cep` (+ symlink).
- `npm run zxp` -- signed ZXP to `dist/zxp` (self-signed cert from the
  `zxp` block in `cep.config.ts`; timestamped, `allowSkipTSA: false`).
- `npm run zip` -- ZXP plus `copyZipAssets` bundled to `./zip`.

## What is stubbed / planned (not documented as done)

- **Depth graph**: built (`src/js/main/components/DepthGraph/`): SVG lanes
  with camera glyph, drag-to-set-depth (pointer capture, ESC cancel-and-
  restore), click-to-select, arrow-key nudge (Shift = 10x, Alt = 1, one
  gesture per press-and-release), double-click / Enter numeric entry, and
  a linear/log depth-scale toggle. Coverage status, exposed px and band
  widths render from engine data only; the band segment maps engine px to
  screen px 1:1 clamped to the track (display convention, not band math).
  Spec items NOT in the graph yet: per-lane audit toggles, the hidden-plane
  notice chip, and the reconciled-error flash (5.3). The old
  `DepthGraphPlaceholder` remains on disk but is no longer rendered.
- **Engine bundling**: dev loads `Parallaxie_v1.jsx` by absolute path (see
  above). TODO(release): concatenate the engine into the compiled jsx bundle
  via bolt's `// @include` hook so the shipped ZXP carries its own core.
- **Per-plane coverage table**: the v1.2 dispatcher names exposing planes
  (`checkMove` `exposes[]`) but only *counts* cut-outs, so per-plane
  clear/cutout labels render as "unknown"/"-" against the real engine. The
  spec's per-plane records (`PANEL_SPEC.md` 7.4) are a requirement on a
  future dispatcher revision.
- **Phased depth command**: the dispatcher has no
  `{"cmd":"depth.set", phase: begin|drag|commit}` yet; the drag protocol's
  undo group is opened/closed by panel-owned ExtendScript helpers
  (`pxeBeginUndoGroup` / `pxeEndUndoGroup`) around plain `setDepth` calls.
  The engine's undo-hygiene debts (CLAUDE.md #7) are unchanged underneath.
- **Comp identity guard** (PANEL_SPEC 10.5): every call still targets
  `app.project.activeItem`; the explicit-comp argument is planned engine
  work (S2 #19), so do not move panel focus between AE comps mid-gesture.
- Fog section, audit lane toggles, hidden-plane notice chip, host-skin
  color sync, and the collapsible console are spec items not yet built;
  the Utilities row covers Audit Off / Bake / Reset / Status.

## Ground rules honored here

- No `alert()`/`confirm()` anywhere (inline confirm strips instead; bolt's
  stock `evalES` alert was patched out).
- ASCII only in every label and string; no emoji.
- Full multi-line engine output, always: the bridge is the single choke
  point that appends every result to the console (defect #9 cannot recur in
  a component).
- The panel never hand-computes bands or coverage.
- No engine files were moved, renamed, or modified.
