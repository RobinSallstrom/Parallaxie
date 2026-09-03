# PARALLAXIE — Product Brief v1.0
### A 2.5D parallax rig-and-animate panel for After Effects
*Robin Sällström × Claude · 2026-08-27 · successor to Z Space Controller v2*

---

## Positioning

Parallaxie is the AE-side engine of the Battlemarked cinematics pipeline: it turns a
convention-named layered PSD comp into a finished, camera-animated 2.5D parallax shot
in three clicks, while staying fully hand-tunable between each click. It merges the
best of three ancestors and adds what none of them have:

| Taken from | What |
|---|---|
| **Parallaxer 3** | One-click convert of a whole comp; per-layer depth nudge (−/Flat/+); Bake; Reset/2D-convert back |
| **AnimateParallax** | Near/Far range thinking; even **Distribute** and bounded **Randomize**; the ambition of *seeing* depth per layer at a glance |
| **Z Space Controller v2** | Slider-driven live depth via expressions (Z Space slider + Scale Center) so framing at t=0 always matches the flat art; scene presets |
| **New in Parallaxie** | Build-from-naming-convention (01_…0N_ = back-to-front, FX co-planar), **camera-move presets** (one motivated move per shot — the Warbringers rule), **fog-card generator**, **reveal-band audit mode**, and all three ZSC v2 bugs fixed |

Not building (v1): AnimateParallax's draggable graph UI (ScriptUI can't do it well —
sliders + numeric fields carry the same information), multi-move combos (forbidden by
the style bible anyway), per-element rigging.

## The three-click workflow

1. **BUILD** — select nothing, click Build from Comp. Parallaxie scans layer names for
   the `NN_` convention (`01_SKY … 04_NEAR`, `05_FX_*`), makes them 3D, adds a 50mm
   camera parented to a `PXE_CAM` null, assigns depths automatically (lowest number =
   Far, highest = 0; `05_FX_*` layers inherit the depth of the first plane *below* them
   in the stack, co-planar so they ride together), and rigs every plane with
   panel-compatible expressions. Frame 1 is pixel-identical to the flat art.
2. **DEPTH** — layer list with slider + numeric field per plane (live, expression-driven).
   Distribute (sorted by stacking order, deepest = farthest — ZSC bug #2 fixed),
   Randomize ±band, Near/Far scene presets (Room / Exterior / Epic Vista / Custom).
3. **MOVE** — pick ONE camera move: Push-In · Pull-Back · Drift L · Drift R · Rise ·
   Sink. Set duration + strength (%). Eased keyframes land on the null. "Clear Move"
   wipes them. Strength is defined as apparent scale change of the mid-depth plane,
   so 5% means 5% regardless of scene scale.

Support tools:

- **Fog Card** — one click inserts a comp-sized teal fractal-noise solid at a chosen Z
  slot (Screen, low opacity, slow self-drift), rigged like a plane. The between-planes
  atmosphere that carries half the Warbringers look.
- **Audit Reveal Band** — solos the selected plane and jumps the camera to its move
  extreme so you can inspect exactly the backfill strip parallax will expose. Toggle
  off restores everything. Closes the loop with the Backfill Playbook §3.
- **Bake** — samples *post-expression* values (ZSC bug #1 fixed: no anchor-point
  re-scale, no layout jump), then strips expressions/effects. Un-rig (Reset) also provided.

## Engineering decisions

- **Base Position point control** replaces `thisProperty.valueAtTime(0)` (ZSC bug #3):
  planes and fog cards can now have animated drift without fighting the rig.
- **Core/UI separation.** Everything lives in a scriptable core object
  (`$.global.PXE`): `buildFromComp() · setDepth() · distribute() · randomize() ·
  applyMove() · clearMove() · addFogCard() · auditOn()/auditOff() · bake() · reset() ·
  status()`. The panel is a thin skin over it. This makes Parallaxie drivable by
  scripts and by Claude through the adb-mcp AE bridge — and therefore autonomously
  smoke-testable.
- **Compatibility:** layers rigged by ZSC v2 are recognized (same "Z Space" slider
  name) and can be adopted/migrated by Build.
- Camera: one-node 50mm (zoom = compWidth × 50/36), parented to `PXE_CAM` null at comp
  center. All moves animate the null, never the camera, never two properties at once.
- No emoji in button labels (ZSC minor bug: boxes on some builds). Plain ASCII UI.

## Acceptance tests (the smoke-test script)

1. Build on `BM_Ythryn_Pilot` comp → camera + null exist, all `NN_` planes 3D + rigged,
   frame-0 render == flat art (visual diff).
2. Depth edits via slider change parallax but never frame 0.
3. Push-In 5%/6s → two eased keys on null; frame 0 unchanged; last frame shows
   plane-dependent scale growth (near grows more than far).
4. Fog card exists at slot Z, drifts, Screen mode, doesn't change frame 0 outside its
   own added atmosphere.
5. Audit mode solos + jumps to extreme; toggling off restores solo states and time.
6. Bake → expressions gone, effects gone, rendered frame identical before/after bake
   (the v2 bake-jump bug regression test).
7. Reset → planes back to 2D-equivalent state (scale 100, no effects).

## v2 candidates (not now)

Draggable depth-graph (CEP/UXP panel), multi-shot batch build, camera shake/breath
micro-motion, auto fog-card count from plane gaps, depth import from depth-map images.
