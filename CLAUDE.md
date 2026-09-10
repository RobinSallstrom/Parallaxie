# Parallaxie — working agreement

Parallaxie is a standalone 2.5D parallax rig-and-animate engine for After Effects: layered
art in, one finished camera-animated shot out. Read `README.md` for the workflow,
`Parallaxie_Brief.md` for positioning and the open UI decision, `docs/ROADMAP.md` for what
comes next, and `docs/ARCHITECTURE_REVIEW.md` before touching the engine.

Robin is the taste; you are precision and mechanics. He wants a **critical partner, not an
executor** — challenge plans, name the real problem, be direct about what will not work.
When a report and the code disagree, the code is the fact and the report is a claim.

## Layout is load-bearing — do not "tidy" it

`PXE_SmokeTest.jsx` resolves siblings via `$.fileName`: it expects `Parallaxie_v1.jsx` and
`PXE_Fixture.jsx` **in the same folder** and writes to `_pxe_test/` next to itself.
`tools/verify_frames.py` resolves `_pxe_test` as `../_pxe_test` from its own location.
Moving files into `src/` breaks both without any error message worth reading. The
`src/`, `tests/`, `dist/` layout in the architecture review §6.1 is a planned refactor
that must move all three together and add a build step; do not do half of it.

Windows and macOS are both first-class. No platform-specific paths, ever; `.gitattributes`
normalises line endings to LF. The first `git status` after pulling on a fresh clone may
show a one-time renormalisation.

## The invariant

**Build must not disturb frame 0.** On the synthetic fixture (solids + Gradient Ramp,
which are scale-invariant) this is exact and is the suite's hard gate: `md5(f_flat) ==
md5(f_built) == md5(f_push_t0)`. If that md5 lock breaks, nothing else matters. On **real
painted raster art the lock is visual, not byte-exact**: AE's 3D camera resamples a scaled
raster plane sub-pixel, so frame 0 comes back visually identical but off by <=~3/255 on
anti-aliased edges (measured on Battlemarked hero art, 2026-09-10). The rig itself adds zero geometric
error: suite TEST 13 scales a procedural plate to ~250% and frame 0 stays byte-exact, so
the <=~3/255 on real art is AE's bitmap resampling, not the rig. Verified headless under
Advanced 3D. Non-100% scale
now holds (defect #1 fixed, v1.4, proven by the SCALED FRAME-0 md5 lock); parented and
keyed layers are still open — see the debts below.

## Rules

- Run `PXE.preflight()` first, every time.
- Never hand-compute reveal bands — call `PXE.bands(move, pct)` / `PXE.checkMove(move, pct)`.
  The lateral shorthand is only correct for the frontmost cut at `z_near ≈ 0`, and is
  meaningless for push/pull, which exposes radially.
- One camera move per shot. Never two properties at once. Moves animate the `PXE_CAM` null,
  never the camera. (Whether this stays a hard rule or becomes the default with a warning
  is an open product decision; until Robin decides, the engine's current behaviour stands.)
- Depth comes from stacking order (top = nearest), not the `NN_` numbers.
- Hidden `NN_` layers are reported, never silently skipped.
- No `alert()`/`confirm()` in the core; the UI decides. Every failure names the layer and
  the fix. No emoji or non-ASCII in labels.
- Prefer matchNames over display names in any new ExtendScript. Do not add another
  `("Slider")` or `("Point")` lookup; the existing ones are debt #6 below.
- After ANY engine change, re-run the suite and diff against `_pxe_test/report.txt`.
  69 PASS / 0 FAIL is the bar (49 pre-dispatcher, 54 pre-v1.3, 63 pre-v1.4, 67 pre-defect-1-test). Frame locks are checked by `tools/verify_frames.py`.
- Describe planned things as planned. Do not document features the code does not have.

## The test suite and its baseline

The suite is self-contained: `PXE_Fixture.jsx` builds the scene from solids (`PXE_TEST`,
1920×1080, 24 fps, 6 s; stack and options in the file header). No PSD, no external files.
Run it from AE with File > Scripts > Run Script File on a fresh project, then
`python3 tools/verify_frames.py`.

**There is no baseline on the synthetic fixture yet.** `_pxe_test/report_baseline_v1.2_legacy-fixture.txt`
is the last known-good run on the old fixture, kept for history; its detail strings will not
match and it predates the current `checkMove` (its 9.6 line says 10.0%; the current code
should print 0.0% for a zero-bleed plate). The first real run must be checked by eye against
the predicted strings in `docs/ARCHITECTURE_REVIEW.md` (Appendix B) and then committed as
`_pxe_test/report.txt`. Until that exists, "the suite passes" is a prediction, not a fact.

## Headless runs (optional)

The adb-mcp bridge is a developer convenience, not a requirement. `tools/ae_send.py` finds it
via `PXE_ADB_MCP_PATH` (fallback `ADB_MCP_PATH`), pointing at adb-mcp's `mcp/` folder; unset,
it exits with instructions. The bridge sends script *text*, which leaves `$.fileName` empty,
so send a one-line wrapper that sets `$.global.PXE_SUITE_HEADLESS = true` (or the closing
`alert()` hangs the bridge) and `$.evalFile()`s `PXE_SmokeTest.jsx` by absolute path. Start
from a fresh project via `app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES)`; a bare
`app.newProject()` on a dirty project raises a save dialog, which also hangs the bridge.
AE flushes frame PNGs *after* the bridge returns, so hash them with `verify_frames.py`,
never immediately.

## Known debts — do not paper over these

These are the S1 findings of the architecture review (§3). They are known. Do not
re-discover them, do not work around them in a caller, and do not mark a task done that
touches one of these areas without either fixing it or saying explicitly that it is still
open.

1. **FIXED in v1.4 — Scale expression discards existing scale.** `SCALE_EXPR` used to
   return `[100f, 100f, 100]` and `reset()` hard-coded 100, so any layer not at 100%
   jumped on Build. Now the expression multiplies the layer's own `value` (x/y independent,
   z untouched) and `reset()` leaves the captured base scale. Proven by the SCALED FRAME-0
   md5 lock (suite TEST 12) and re-run headless. Keyframed scale is still debt #3 (preflight
   now WARNs).
2. **Parented layers mix coordinate spaces.** Base Position is read in parent space, Scale
   Center in comp space. Fix: preflight BLOCKER plus an unparent-keeping-transform path.
3. **Pre-existing keyframes are overridden, then break Bake/Reset.** Build captures the
   value at the current CTI and expressions cover the keys; `setValue` on a keyed property
   throws mid-loop. Fix: preflight BLOCKER on `numKeys`; Bake/Reset must handle or refuse.
4. **Locked layers abort Build half-way.** `preflight` never reads `l.locked`.
5. **Renderer is never checked.** The md5 lock is a claim about Classic 3D only; Advanced
   3D is the default for new comps since AE 24. Warn in preflight and run the suite under
   both.
6. **Localisation.** `("Slider")` and `("Point")` lookups in ExtendScript and in the
   expressions fail on a non-English AE. Use matchNames and index-form expression access.
7. **Undo hygiene.** `applyMove` calls `ensureRig` before opening its group; `clearMove`
   and `auditOn/Off` have no group; depth ops have groups without `try/finally`; the panel
   slider commits on every `onChanging` tick. Rule: begin first, `try/finally`, nothing
   mutates before `begin`.
8. **Build is destructive on re-run and the ZSC-v2 "adoption" is broken.** Every Build
   resets depths; `isRigged` checks one of three controls, so a partial rig is skipped and
   its expressions error.
9. **The panel throws warnings away.** `say()` shows the first line only; the hidden-layer
   WARN that v1.1 exists to surface never reaches a panel user.

S2 items (comp resize after rig, camera zoom not tied to distance, `activeCamera`
assumptions, FX co-planarity only at Build, probably-wrong Fractal Noise parameter indices
hidden by a `try/catch`, name-keyed references, Pull-Back first-failure solve missing,
`allowHidden` misleading, `activeItem` semantics, track mattes, `PXE.far` as hidden state,
moves always starting at t=0) are listed in the review; consult it before touching those
areas.

## Scope

This repo is the engine, its harness and its documentation. It has no upstream pipeline
and no downstream shot folder. If a change only makes sense for one particular piece of
artwork, it does not belong here; it belongs in a preset or a fixture variant, and the
suite must still pass.
