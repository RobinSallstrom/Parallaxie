# Parallaxie

**A 2.5D parallax rig-and-animate engine for After Effects.**

Parallaxie turns a convention-named layered PSD comp into a finished, camera-animated
2.5D parallax shot in three clicks, and stays hand-tunable between each one. It exists
because the "Warbringers: Jaina" look — flat key art given real depth by one motivated
camera move — is a repeatable process, not a one-off.

Everything lives in a scriptable core at `$.global.PXE`, with the UI as a thin skin over
it. That means it is drivable by hand, by script, and by an LLM through the adb-mcp
After Effects bridge — and therefore autonomously testable.

Current version: **v1.2**. Test suite: **49 passing, 0 failing.**

---

## The three-click workflow

1. **BUILD** — scans layer names for the `NN_` convention (`01_SKY … 04_NEAR`, `05_FX_*`),
   makes them 3D, adds a 50mm camera parented to a `PXE_CAM` null, assigns depths from
   stacking order, and rigs every plane with expressions. **Frame 1 is pixel-identical to
   the flat art** — that invariant is the whole game, and it's locked by an md5 test.
2. **DEPTH** — slider + numeric field per plane. `distribute()` with a bias that clusters
   heroes near camera, `randomize()` within a bounded band, Near/Far scene presets.
3. **MOVE** — exactly one camera move per shot: Push-In · Pull-Back · Drift L · Drift R ·
   Rise · Sink. Strength is defined as apparent scale change of the mid-depth plane, so
   5% means 5% regardless of scene scale.

Plus: **fog cards** (the between-planes atmosphere that carries half the look), **reveal-band
audit mode** (solos a plane and jumps the camera to its move extreme so you can inspect the
backfill strip parallax will expose), and **bake**/**reset**.

## The part worth stealing

Reveal-band math, because the obvious formula is wrong. The common shorthand
`d × (z_far − z_near) / (zoom + z_far)` is the *lateral* case with `z_near ≈ 0` — correct
for the frontmost cut, progressively wrong for interior cuts, and meaningless for a push-in.

- Exact lateral: `d × zoom × (z_far − z_near) / ((zoom + z_near)(zoom + z_far))`
- Push/pull exposes **radially**: `band = r × (m_near − m_far)`, where `m(z) = (zoom+z)/(zoom+z−dolly)`
  — and only on centre-facing edges. Edges facing away are covered, not revealed.

`PXE.checkMove(move, pct)` runs this before you commit: it reports which plates lose coverage
and the exact percentage at which the first one fails. Don't hand-compute bands; call
`PXE.bands(move, pct)`.

## API

```
preflight()                      // run FIRST, every time
buildFromComp(far, {order, allowHidden})
setDepth() · setDepths({name:z}) · distribute(near, far, bias) · randomize()
applyMove("Push-In|Pull-Back|Drift L|Drift R|Rise|Sink", sec, pct) · clearMove()
addFogCard(z, opacity, [r,g,b]) · restackFog()
auditOn() / auditOff() · bands(move, pct) · checkMove(move, pct)
bake() · reset() · status()
```

Import PSDs as **"Composition – Retain Layer Sizes"** only. Depth comes from AE stacking
order (top = nearest), not from the `NN_` numbers — export stacks often number front-to-back,
which silently inverted scenes in v1.0. Pass `order:"name-asc"` for the old behaviour.

## Running the tests

```bash
# headless, no human clicks
python3 tools/ae_send.py PXE_SmokeTest.jsx 900
python3 tools/verify_frames.py            # AE flushes PNGs after the bridge returns
```

Set `$.global.PXE_SUITE_HEADLESS = true` before `$.evalFile` — otherwise the closing
`alert()` blocks the CEP bridge until someone clicks OK. `_pxe_test/report.txt` holds the
last known-good run as a regression baseline. **After any change to the engine, re-run the
suite before calling it done.**

## Known blockers (before this can be published)

1. **The suite depends on proprietary art.** `PXE_SmokeTest.jsx` requires
   `BM_Ythryn_Split_V02.psd` (161MB of Battlemarked studio art) beside it. A neutral
   synthetic fixture — a generated multi-plane PSD — would make the suite self-contained
   and the repo publishable. This is the single biggest thing standing between Parallaxie
   and a public release.
2. **`tools/ae_send.py` hardcodes** `/Users/robin/Documents/Projects/adb-mcp/mcp`.
   Make it an env var or a config lookup.
3. **Version string is inconsistent** — the header comment says `PARALLAXIE v1.0`, the
   `VERSION` constant says `1.2`. Pick one.
4. No panel UI is shipped here; this is the scriptable core plus its harness.

## Requirements

After Effects, plus the [adb-mcp](https://github.com/mikechambers/adb-mcp) bridge
(proxy on `:3001` + the "AfterEffects MCP Agent" CEP panel) for headless runs.

## Provenance

Successor to Z Space Controller v2, merging ideas from Parallaxer 3 (one-click convert,
per-layer depth nudge, bake) and AnimateParallax (near/far range thinking, distribute,
randomize), and fixing all three ZSC v2 bugs. Extracted 2026-09-03 from the Battlemarked
cinematics pipeline, where it was developed. Full design rationale in `Parallaxie_Brief.md`.

Robin Sällström × Claude, 2026.
