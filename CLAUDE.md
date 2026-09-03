# Parallaxie — project guide

Parallaxie is a 2.5D parallax rig-and-animate engine for After Effects. Read `README.md`
for the workflow and `Parallaxie_Brief.md` for the design rationale before proposing changes.

Robin is the taste; you are precision and mechanics. He wants a **critical partner, not an
executor** — challenge plans, name the real problem, be direct about what won't work.

## Layout is load-bearing — don't "tidy" it

`PXE_SmokeTest.jsx` resolves siblings via `$.fileName`: it expects `Parallaxie_v1.jsx` and
the fixture PSD **in the same folder**, and writes to `_pxe_test/` next to itself.
`tools/verify_frames.py` resolves `_pxe_test` as `../_pxe_test` from its own location.
Moving files into `src/` breaks both without any error message worth reading.

## The invariant

**Frame 0 of a built comp must be byte-identical to the flat art.** `md5(f_flat) ==
md5(f_built) == md5(f_push_t0)`. Depth edits, camera moves and fog cards must never
disturb it. If that lock breaks, nothing else in the suite matters.

## Rules

- Run `PXE.preflight()` first, every time.
- Never hand-compute reveal bands — call `PXE.bands(move, pct)` / `PXE.checkMove(move, pct)`.
  The lateral shorthand is only correct for the frontmost cut at `z_near ≈ 0`, and is
  meaningless for push/pull, which exposes radially.
- One camera move per shot. Never two properties at once. Moves animate the `PXE_CAM` null,
  never the camera.
- Depth comes from stacking order (top = nearest), not the `NN_` numbers.
- Hidden `NN_` layers are reported, never silently skipped.
- After ANY engine change, re-run the suite headless and diff against
  `_pxe_test/report.txt`. 49 PASS / 0 FAIL is the bar.

## Headless runs

Set `$.global.PXE_SUITE_HEADLESS = true` before `$.evalFile`, or the closing `alert()`
hangs the CEP bridge. Start from a fresh project via
`app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES)` — a bare `app.newProject()` on a
dirty project raises a save dialog, which also hangs the bridge. AE flushes frame PNGs
*after* the bridge returns, so hash them with `tools/verify_frames.py`, never immediately.

## Scope

This repo is the **engine**. The Photoshop-side split pipeline (guide tracing, peel-and-fill,
backfill) and the Battlemarked shots live in `../cinematics` and stay there. If a change only
makes sense for one specific shot, it belongs there, not here.
