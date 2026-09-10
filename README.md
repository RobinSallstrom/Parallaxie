# Parallaxie

**A 2.5D parallax rig-and-animate engine for After Effects.**

Parallaxie takes a layered comp — key art, an illustration, a photo that has been separated
into planes — and turns it into a finished, camera-animated 2.5D shot in three clicks:
build the rig, set the depths, apply one camera move. Between each click everything stays
hand-tunable, and frame 0 of the animated shot matches the flat art you started with:
pixel-exact on flat-colour and gradient planes, and visually identical (sub-pixel, within
~3/255) on painted raster art, where AE's 3D camera resamples scaled planes.

It is built for motion designers who animate finished artwork rather than model scenes:
trailer and title work, hero art and key art, editorial illustration, photo parallax.
It is a rig, not a template pack — it gives you depth, a motivated camera move and a
coverage check that tells you where the art will run out, and gets out of the way.

Current version: **1.4** (scriptable core, a minimal ScriptUI panel, and a CEP panel in `cep/`).
Test suite: 74 checks, self-contained. See [Status](#status) for what is not done yet.

---

## The three-click workflow

**1. Build.** Parallaxie scans the comp for planes named with a two-digit prefix
(`01_SKY`, `02_MID`, `03_NEAR`; anything containing `_FX` rides co-planar with the plane
below it). No prefixes? Select the plane layers and use **Build from Selected** —
Parallaxie adds the `NN_` prefixes itself from the stacking order (original names kept
after the prefix) and rigs exactly what you selected. Either way it makes the planes 3D, adds a 50 mm one-node camera parented to a `PXE_CAM` null, and
rigs every plane with two expressions. Depth is assigned from **stacking order** — top of
the stack is nearest — because that is how the frame was actually composited and it
cannot lie. The numbers in the names are metadata; if they disagree with the stack you
are told, and the stack wins.

**2. Depth.** A slider and a numeric field per plane, live. `distribute(near, far, bias)`
re-spaces every plane; a bias above 1 clusters planes near the camera and pushes the depth
budget to the back, which is what you want when several foreground elements need fine
separation and the scenery can take the rest. `randomize(band)` breaks up even spacing.
Scene presets (Room 1500, Exterior 5000, Epic Vista 8000) set the far distance.

**3. Move.** One camera move per shot: Push-In, Pull-Back, Drift L, Drift R, Rise, Sink.
Two eased keyframes land on the null; the camera itself never animates. Strength is
normalised: for a push or pull, 5% means the mid-depth plane grows or shrinks by exactly
5% on screen; for a drift, rise or sink, 5% means the camera travels 5% of the comp width
or height. The same number gives the same felt intensity on a 1080p social cut and a
4K portrait poster.

Around the three clicks:

- **Coverage check** — `checkMove(move, pct)` tells you, before you animate, which
  full-frame plates will run out of paint at a given strength and by how many pixels, and
  for lateral moves the exact strength at which the first one fails. `bands(move, pct)`
  gives the reveal width per depth cut. **Know which layers need more paint before you
  start**, not at the client review.
- **Audit mode** — solos one plane plus the camera and jumps to the move extreme so you
  can see exactly the strip the parallax will expose. Toggle off restores everything.
- **Bake** — samples post-expression values and strips the rig, with no layout shift.
  **Reset** returns the layers to flat 2D.
- **Fog cards** (extra) — `addFogCard()` inserts a comp-sized Fractal Noise solid in
  Screen mode at a chosen depth, rigged like a plane with a slow self-drift and stacked
  into the slot its depth implies. Optional depth haze for art that wants it; leave it off
  for clean illustration or product key art.

## What makes it different

**Coverage is a first-class question.** Every parallax tool moves layers in Z. None of
them tells you what the move will reveal. The obvious band formula,
`d × (z_far − z_near) / (zoom + z_far)`, is the lateral case with `z_near ≈ 0` — right for
the frontmost cut, progressively wrong for interior cuts, and meaningless for a push,
which exposes radially and only on centre-facing edges. Parallaxie uses the exact forms:

- Lateral: `d × zoom × (z_far − z_near) / ((zoom + z_near)(zoom + z_far))`
- Radial: `band = r × (m_near − m_far)`, where `m(z) = (zoom + z) / (zoom + z − dolly)`

Do not hand-compute bands; call `PXE.bands()` and `PXE.checkMove()`.

**Nothing jumps at frame 0.** The rig's projection lock is independent of anchor point and
2D rotation, and the test suite proves it with an md5 on the rendered frame, not a
tolerance. This is table stakes for a parallax tool; Parallaxie treats it as an
invariant rather than a feature.

**Normalised move strength.** Strength is defined perceptually (apparent scale change of
the mid-depth plane), so presets transfer between scenes and a number in a brief means
something.

**One motivated move per shot.** Applying a move replaces the previous one. Flat art given
depth reads best with a single, deliberate camera idea — a push, a drift, a rise — rather
than a stack of competing motions. The rig makes the disciplined choice the easy one.

**Depth from stacking order.** The number in a layer name can run either way depending on
who exported the file; the stack cannot. Building from the stack removes the inverted-scene
bug class entirely.

**Scriptable core.** Everything lives in `$.global.PXE`; the panel is a thin skin over it.
The same functions drive the panel, a script, a batch job, or an automated test run, and
every function returns a plain string beginning `OK` or `ERROR`.

## Installation

Parallaxie is a single file, `Parallaxie_v1.jsx`. Either:

- **Dockable panel:** copy it into After Effects' `Scripts/ScriptUI Panels` folder and
  restart AE. It appears under the Window menu.
- **One-off:** File > Scripts > Run Script File… and pick it. It opens as a palette.

Windows and macOS are both first-class; there are no platform-specific paths anywhere in
the engine or the harness. Import layered PSD or AI files as a composition with layer
sizes retained (recommended, not required — plane footprints are read from
`sourceRectAtTime`).

To try the panel on a ready-made scene, run `PXE_Fixture.jsx` from File > Scripts; it
builds the demo comp described under [The fixture](#the-fixture).

## API

Load the core without the panel by setting `$.global.PXE_HEADLESS = true` before
`$.evalFile`. All functions act on the active comp and return a string.

| Function | What it does |
|---|---|
| `preflight()` | Run first, every time. Reports blockers and warnings before you build. |
| `buildFromComp(far, {order, allowHidden})` | Rig every `NN_` plane. `order`: `"stack"` (default), `"name-asc"`, `"name-desc"`. |
| `buildFromSelection(far)` | Rig the **selected** layers, no renaming needed: missing `NN_` prefixes are added from stacking order (bottom = 01 = farthest), then a stack-order Build runs. |
| `adoptSelected(z)` | Add the selected layers to an **existing** rig without a rebuild. Depth defaults to the plane below each layer in the stack; pass `z` to override. Renames to `NN_` as needed. |
| `setDepth(name, z)` · `setDepths({name: z, …})` | Set one or many depths by layer name. |
| `distribute(near, far, bias)` | Re-space rigged planes by stacking order; `bias > 1` clusters toward camera. |
| `randomize(band)` | Jitter each depth by up to ±band (default 200), clamped at 0. |
| `applyMove(type, seconds, pct)` | One of `"Push-In" "Pull-Back" "Drift L" "Drift R" "Rise" "Sink"`. Replaces any existing move. |
| `clearMove()` | Remove the move keys and recentre the null. |
| `addFogCard(z, opacityPct, [r,g,b])` | Fog card at depth z (default: half the mean plane depth), 12% opacity, restacked by depth. |
| `restackFog()` | Re-seat every fog card into the stack slot its depth implies. |
| `bands(type, pct)` | Reveal width per adjacent-plane cut, exact for lateral and radial moves. |
| `checkMove(type, pct)` | Which full-frame plates lose coverage, by how many pixels, and the first-failure strength. |
| `auditOn(name)` · `auditOff()` | Solo a plane and jump to the move extreme; restore. |
| `bake()` · `reset()` | Strip the rig keeping the result; or return to flat 2D. |
| `status()` | One line per rigged layer: depth and current scale. |

The engine's input assumptions are documented honestly under [Status](#status).

## Running the tests

The suite needs nothing but After Effects. It builds its own scene.

1. Keep `Parallaxie_v1.jsx`, `PXE_Fixture.jsx` and `PXE_SmokeTest.jsx` in one folder (they
   are, in the repo root). The suite resolves its siblings via `$.fileName`, so do not move
   them apart.
2. In AE, start a fresh project (File > New > New Project).
3. File > Scripts > Run Script File… → `PXE_SmokeTest.jsx`. It runs the 74 checks, writes
   `_pxe_test/report.txt` and six frame PNGs next to the script, and finishes with an alert.
4. Optionally, `python3 tools/verify_frames.py` hashes the PNGs and asserts the three frame
   locks: `f_flat == f_built == f_push_t0` (frame-0 lock), `f_prebake == f_postbake` (bake
   lock), `f_push_end != f_flat` (the move did something). It waits for AE to finish
   flushing the files before hashing.

### Headless runs (optional)

For terminal or agent-driven runs there is a driver for the open-source
[adb-mcp](https://github.com/mikechambers/adb-mcp) After Effects bridge (its proxy on
`:3001` plus the "AfterEffects MCP Agent" CEP panel inside AE). This is a developer
convenience; the product has no dependency on it.

```bash
export PXE_ADB_MCP_PATH=/path/to/adb-mcp/mcp     # Windows: set PXE_ADB_MCP_PATH=C:\path\to\adb-mcp\mcp
python3 tools/ae_send.py wrapper.jsx 900
python3 tools/verify_frames.py
```

`ADB_MCP_PATH` is honoured as a fallback. Because the bridge sends script *text*,
`$.fileName` is empty inside AE, so send a one-line wrapper that sets
`$.global.PXE_SUITE_HEADLESS = true` (otherwise the closing `alert()` blocks the bridge)
and `$.evalFile()`s `PXE_SmokeTest.jsx` by absolute path. Start from a fresh project via
`app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES)`; a bare `app.newProject()` on a
dirty project raises a save dialog, which also hangs the bridge.

### The fixture

`PXE_Fixture.jsx` builds a deterministic comp, `PXE_TEST`, 1920×1080, 24 fps, 6 s, from
solids only (Gradient Ramp for texture, matchName-only property access, no fonts, no
randomness) so the frame hashes are stable across machines. Stack, top to bottom:

| Layer | Role |
|---|---|
| `03_NEAR` | cut-out foreground solid, lower left; nearest plane (z = 0); skipped by `checkMove` as a cut-out |
| `05_FX_PortalGlow` | small additive glow; `_FX` rider that must inherit the gate's depth |
| `02_GATE_ALT` | hidden `NN_` layer; must be reported, never rigged |
| `02_GATE_PLATE` | full-frame plate with bleed, deliberately off-centre; mid depth |
| `01_SKY_ALT` | hidden `NN_` layer |
| `01_SKY_PLATE` | full-frame plate with zero bleed; far plane; the one `checkMove` must flag on a drift |

`make(opts)` accepts `width`, `height`, `fps`, `duration`, `name`, `renderer`
(`"ADBE Picasso"` for Classic 3D, `"ADBE Advanced 3d"`) and `splitter2D` (adds an enabled
2D layer between the planes so the 2D-split warning fires on every build; off by default).

### Baseline

`_pxe_test/report_baseline_v1.2_legacy-fixture.txt` is the last known-good run on the
previous, proprietary fixture and is kept for history only. **No baseline has been captured
on the synthetic fixture yet.** The first real AE run must be checked by eye (expected
detail strings are listed in `docs/ARCHITECTURE_REVIEW.md` and the roadmap) and then
committed as `_pxe_test/report.txt`, which becomes the regression reference.

## Status

What works: the three-click workflow, coverage maths, audit, fog cards, bake and reset, on
layers that are at 100% scale, unparented, unkeyed, unlocked, in an English-language AE
with the Classic 3D renderer and no pre-existing camera. That describes the pipeline this
was extracted from; it does not describe an arbitrary comp. The following are known and
tracked, not surprises:

- **No test baseline on the new fixture.** The synthetic fixture and the portable harness
  have not yet been executed in After Effects. Phase 0 of the roadmap is that run.
- **Engine defects that will bite an ordinary comp** (detail in `docs/ARCHITECTURE_REVIEW.md`
  §3): parented layers mix coordinate spaces; pre-existing position or scale
  keyframes are silently overridden and then make Bake and Reset throw; a locked layer
  aborts Build half-way; the renderer is never checked and the frame-0 lock is only
  proven under Classic 3D; effect parameters are looked up by localised display name, so
  a non-English AE breaks every rigged layer; undo grouping is inconsistent; Build is
  destructive on re-run; and the panel shows only the first line of any result, so the
  warnings the engine produces never reach a panel user.
- **UI technology undecided.** The current ScriptUI panel is a thin development skin
  with no preflight, coverage or depth view. The choice between ScriptUI and a CEP panel
  is laid out in `Parallaxie_Brief.md`; nothing user-facing is committed until it is made.
- **Convention-free comps go through `buildFromSelection`** (select the planes, build,
  prefixes added automatically); `buildFromComp` still requires the `NN_` naming. Plane
  membership is still name-based after the auto-rename (review #16: rig identity by
  tag/`layer.id` is planned).
- **Coverage tooling is API-only.** `checkMove` and `bands` are the most valuable thing in
  the engine and are not reachable from the panel.

## Requirements

- Adobe After Effects with ExtendScript (any modern version; only Classic 3D has been
  verified so far). Windows or macOS.
- Python 3 for `tools/verify_frames.py` and `tools/ae_send.py` (optional; the suite itself
  runs without Python).
- The adb-mcp bridge only if you want headless runs.

## Documents

- `Parallaxie_Brief.md` — product brief: positioning, principles, the UI decision,
  acceptance criteria, pre-release checklist.
- `docs/ROADMAP.md` — phased plan.
- `docs/COMPETITIVE_ANALYSIS.md` — the market, the competitors, what buyers complain about.
- `docs/ARCHITECTURE_REVIEW.md` — code review, defect list, test-suite review, v2 layout.
- `CLAUDE.md` — working agreement for AI-assisted sessions in this repo.

## Credits

Robin Sällström (design, direction, taste) with Claude (engineering, mechanics, review).
Successor to Z Space Controller v2; takes one-click convert and bake from the Parallaxer
lineage and range-based distribute/randomize thinking from AnimateParallax, and adds
camera-move presets, coverage maths and a scriptable core. 2026.
