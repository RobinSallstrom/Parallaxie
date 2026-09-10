# Parallaxie — Product Brief v2.0

*Robin Sällström with Claude · 2026-09-08 · supersedes Brief v1.0 (2026-08-27)*

Parallaxie is a standalone After Effects tool for animating layered artwork in Z space:
key art, hero art, illustration, separated photographs. It is a personal and studio tool
first, built to a standard above the current aescripts parallax rigs so that it can become
the top choice there when and if it is submitted. No distribution path is committed. This
brief records what we are building, why, what we are deliberately not building, and the
one open decision that gates the user-facing product: the UI technology.

The evidence behind this brief is in `docs/COMPETITIVE_ANALYSIS.md` and
`docs/ARCHITECTURE_REVIEW.md`; the plan derived from it is `docs/ROADMAP.md`.

---

## 1. Positioning

The "layers to parallax rig" niche on aescripts is a two-product, $39 niche. **Parallaxer 3**
(Cream-FX, $39, ScriptUI, AE CC through 2026) is one-click convert plus relative depth
nudging, wrapped in a chain of modal alerts; you animate the camera yourself.
**AnimateParallax** (TarouTools, $39, CEP, AE 2023+) is a visual Z-layout panel with
Distribute and Random; it does no camera work at all. Below them sit Gumroad primitives
that do only the auto-scale trick (**autoParallax 2** $15, **Pearelax** $29,
**GenKiParallaxer** free). Beside them, **Camera 3D Toolkit Pro** ($89) sells camera
automation without any parallax authoring, and **Motion Bro AI Parallax Tools**
($12/$24) sells single-image AI mesh parallax to the volume buyer. Depth-map plugins
(**Depth Scanner 2**, **Quick Depth 3**, $99.99) produce a depth map and leave the rig to
you. The Videohive templates (**VoluMax** $45, **Photomotion** $49, ~26k sales each) own
the "drop a photo in" segment and are complained about for fragility across host updates,
dead tutorial links and activation problems — almost never for the effect itself.

Nobody in the AE-layer segment sells the *shot*: the camera move and the edge-coverage
problem. Both $39 rigs stop at rigging. The manual baseline, in the words of
an Adobe Community expert, is that "the hardest part of the process is filling in the
holes" — and no tool addresses it.

Parallaxie's position: **the tool that gets you from layered art to a finished, tasteful
2.5D shot, and tells you before you animate which layers need more paint.** Rig, depth,
one motivated move, coverage — in that order, in one panel, with a scriptable core
underneath for studios that batch.

Price context (for later, not decided): a rig has a hard ceiling around $39–49 unless it
demonstrably does more than rig. $39 to match the pair with a documented path to $49–59
once coverage tooling and batch ship is defensible; so is a name-your-own-price launch to
seed reviews. $89 is not, whatever the feature count.

## 2. Target user and jobs to be done

**Primary: the motion designer animating finished artwork.** Trailer and title work, game
and film key art, editorial illustration, album and poster campaigns, social cut-downs of a
hero image. They have a layered file (or can make one), an art director's intent for the
shot, and an afternoon. Their jobs:

1. *Give this flat image believable depth without anything visibly changing at frame 0.*
2. *Choose one camera move that suits the art and set its intensity in a way that transfers
   between shots.*
3. *Know which layers will run out of paint and where, so the backfill pass is targeted
   rather than guessed.*
4. *Hand off a comp that behaves like ordinary keyframed AE, with no rig left behind.*

**Secondary: the studio pipeline.** A trailer, in-game-cutscene or marketing team with many shots in a
consistent naming convention, who want the same move applied across a batch and a
report per shot. They buy the scripting API and the stacking-order build; they are few but
they are the ones who write about tools.

**Not the target:** the one-JPG volume buyer who wants an AI mesh from a single photo. That
is a different product with GPU, model-licensing and cross-platform costs. Parallaxie stays
in that conversation via a planned depth-map-to-plane-depths import and a documented
separation workflow, not by building a mesh tool.

## 3. Principles

**Frame 0 is sacred.** A built comp renders visually identical to the flat art: pixel-exact
on flat-colour and gradient planes (proven by md5 in the suite), and sub-pixel identical on
painted raster (<=~3/255, invisible - AE resamples scaled raster planes). Depth edits,
camera moves and fog cards must never disturb it. Table stakes in the market, so it is an
invariant, not a headline.

**One motivated camera move per shot.** Flat art given depth reads best with a single,
deliberate camera idea. The engine defaults to it and normalises strength so the idea
transfers. Whether it remains a hard rule or becomes a default with a warning is an open
question (see §5).

**Depth comes from the stack, not the name.** Top of the stack is nearest. Names are
metadata that may run either way; the stack cannot lie.

**Never hand-compute coverage.** The exact lateral and radial band forms live in
`PXE.bands()` and `PXE.checkMove()`. The common shorthand is only correct for the frontmost
cut and meaningless for a push.

**Report, never skip.** A hidden plane, a 2D layer splitting the 3D group, a mis-stacked fog
card, a numbering that runs the wrong way: the engine says so, every time, in the return
string. The UI's job is to show all of it, not the first line.

**The core is the product; the panel is a skin.** Every capability is a function on
`$.global.PXE` with a string result. The panel, a batch script and the test suite call the
same functions. This is what lets a solo developer re-verify the whole tool against every AE
beta in minutes — the thing the competitor complaint threads reward most.

**Restraint over sprawl.** Fog cards sit just inside the line as an optional extra; particles,
water and 3D transitions are outside it. A professional rig, not a template pack.

## 4. The three-click workflow (as built, v1.2)

1. **Build** — scan for `NN_` planes (and `_FX` riders), make them 3D, add a 50 mm one-node
   camera parented to the `PXE_CAM` null, assign depth from stacking order, rig with two
   expressions. Frame 0 unchanged.
2. **Depth** — slider plus numeric field per plane; `distribute(near, far, bias)`,
   `randomize(band)`, scene presets Room / Exterior / Epic Vista / Custom.
3. **Move** — Push-In, Pull-Back, Drift L, Drift R, Rise, Sink. Duration and strength; two
   eased keys on the null; applying a move replaces the previous one. Strength is the
   apparent scale change of the mid-depth plane (push/pull) or a fraction of the comp
   dimension (lateral).

Supporting: coverage check (`checkMove`, `bands`; API only today), audit mode, bake,
reset, preflight (API only today), status. Extra: fog cards (optional depth haze between
planes, off by default).

Planned changes to this workflow are listed in §6 and the roadmap and are marked as such
wherever they appear.

## 5. Differentiators, ranked by what buyers value

The competitive analysis is blunt about this ranking and the brief adopts it.

| Rank | Differentiator | Buyer value | Position |
|---|---|---|---|
| 1 | **Coverage / reveal-band maths** — which plate runs out of paint, where, by how much, and the max safe strength | Maps directly to the pain buyers name ("filling the holes") and nothing else in the market has it | Our moat, currently invisible: an API call with no panel surface. Making it visible is the whole of roadmap Phase 2. |
| 2 | **The finished shot** — six moves with perceptually normalised strength, eased, one click | Parallaxer and AnimateParallax stop at the rig; Camera 3D Toolkit has moves but no parallax authoring | Real and marketable ("5% means 5% on any scene"). Needs a global ease control and a start-time parameter to feel complete. |
| 3 | **Depth from stacking order; hidden layers reported** | Invisible when it works; prevents the inverted-scene and missing-layer bug classes that produce one-star reviews | Keep in both build doors. |
| 4 | **Scriptable core, 49-check suite** | Buyers do not buy a test suite; studio TDs buy an API. The external payoff is batch features and surviving AE updates | Mention "documented scripting API" for the TD crowd; sell stability and batch to everyone else. |
| 5 | **Frame-0 pixel lock** | Buyers care that nothing jumps, and four competitors already sell exactly that for $15–39 | Table stakes. Demote to a "Flat / Rigged" proof toggle in the panel and a CI test. Do not lead with it. |
| 6 | **Fog cards** | A look feature, not a rig feature: depth haze helps some art and is wrong for clean illustration or product key art. Unique in the segment but nobody is asking for it | Keep as an optional extra (one function, cheap). Never in the headline; never on by default. Auto-suggest only if it stays trivial. |
| — | **One move per shot** | Read as a limitation next to Camera 3D Toolkit's overlapping keys and shake presets | Keep the principle; reframe as the default ("Cinematic mode") with an additive micro-motion layer and, later, a `checkMove` warning on combinations. Decision for Robin: rule or default. |
| — | **Build from naming convention** | Studios yes; everyone else, friction at minute one | Keep as the "pipeline" door; add selection-based build as the default door. |

## 6. What we are not building

- An AI single-image mesh tool. Different product, different cost base.
- Template-style sprawl: particles, water, portrait animation, 3D transitions.
- Multi-property camera animation (position plus rotation plus zoom at once). The null
  moves; the camera does not.
- A depth editor in ScriptUI *and then* the same editor again in CEP. Whichever UI ships the
  visual depth view ships it once.
- Any runtime dependency on the adb-mcp bridge, Python, or a network call at load. The
  product is one `.jsx` (plus, later, one signed panel).
- Display-name property lookups, `alert()` chains during build, emoji or non-ASCII in labels.

## 7. UI technology — the decision

This is Robin's decision. Both views are laid out here with their tradeoffs; the
recommendation at the end is a recommendation, not a choice made on his behalf.

### The engineering view (architecture review §5)

Build the public panel as a **CEP extension over the existing ExtendScript core**, and keep
the current ScriptUI panel alive as a fallback "Lite" UI. The reasoning:

- The panel's defining screen is a **depth view you can read and drag** — planes as bars on
  a Z axis, camera at the left, a coverage status per plane and the exposed band width. In
  CEP that is a `<canvas>` or SVG with ordinary DOM events; a coverage bar is a `<div>`. In
  ScriptUI it is hand-rolled `onDraw` drawing with manual hit-testing that renders
  differently on Windows and macOS, at roughly three times the effort.
- For a solo developer with an LLM co-pilot, the co-pilot is dramatically stronger at
  HTML/TypeScript than at ScriptUI's undocumented layout quirks, and Bolt-CEP gives a normal
  web dev loop (Vite, hot reload, Chrome DevTools attached to the panel). This is the
  largest practical multiplier in the decision.
- The core/UI split already exists. CEP calls `evalScript` into the same `PXE` object; the
  core needs one addition, a JSON-in/JSON-out dispatcher, which also improves the ScriptUI
  panel and the suite.
- CSXS 11 covers AE 22.0 through 2026, one version wider than AnimateParallax.
- Costs: packaging and signing (about a day once, then a build script); `evalScript` latency
  means drags must be throttled to 10–15 Hz inside one undo group with a watchdog; and
  **three to five extra weeks** over ScriptUI for a panel with the depth graph and coverage
  view.
- The longevity caveat, stated plainly: CEP has an eventual sunset (Premiere first, AE
  unannounced). UXP panels for AE do not exist in 2026, and it is **not guaranteed** that a
  future UXP panel could drive an ExtendScript core. So "the core survives any UI change" is
  true for ScriptUI-to-CEP and unknown for UXP. The mitigation is the same either way: keep
  the core's logic in pure functions over plain data with a thin AE-DOM adapter.

### The market view (competitive analysis §5)

- This niche uses both. Parallaxer 3, autoParallax 2, Camera 3D Toolkit Pro and ParaLight
  are ScriptUI or plain scripts; AnimateParallax and Motion Bro are CEP. The top-trending
  aescripts panels are CEP; GPU effects are native plugins.
- UXP panels for After Effects do not exist as of April 2026; CEP is still fully supported
  in AE with no deprecation signal; ExtendScript/ScriptUI remains viable. Premiere shipped
  UXP and will drop CEP "several years" out, no date. A developer's request to Adobe for a
  CEP/UXP roadmap in January 2026 received no reply.
- Buyers read "product" from a CEP panel and "script" from ScriptUI. ScriptUI is accepted at
  $29–39 (Parallaxer's price); CEP is expected at $49 and above.
- ScriptUI gets to market at Parallaxer parity fastest and with the widest compatibility.
  CEP is what it takes to beat AnimateParallax on the visual axis and to render coverage
  overlays convincingly. Several successful tools shipped ScriptUI first and moved to CEP at
  a major version.

### The tradeoffs side by side

| | ScriptUI (ExtendScript) | CEP (HTML panel + ExtendScript core) | UXP |
|---|---|---|---|
| Time to a usable panel | shortest; core already ExtendScript | +3–5 weeks for depth graph and coverage view | not available for AE panels |
| Visual depth view | static side-view strip feasible; drag interaction laborious | native; parity with AnimateParallax and room to beat it | — |
| Compatibility | any AE with ExtendScript | AE 2022+ | — |
| Perceived polish | "script"; fine at $29–39 | "product"; expected at $49+ | — |
| Longevity | no announced end date; same Adobe | eventual sunset, AE date unknown; UI rewrite later, core likely reusable | future-proof, unavailable |
| Co-pilot leverage | weak (screenshot-driven debugging) | strong (standard web stack) | — |
| Licensing on aescripts | supported | supported | — |

### Recommended path, with fallback

**Recommended:** harden the core first (roadmap Phase 1 — it is a prerequisite for either
UI), rebind the existing ScriptUI panel to the new JSON dispatcher and give it a Preflight
button and a multi-line status so it is usable for real work now, then build the public
panel in **CEP** with the depth graph and coverage view. Ship the CEP panel as the aescripts
product.

**Fallback:** if the CEP build slips or the longevity risk weighs more heavily than the
visual axis, the hardened ScriptUI panel *is* a saleable v1 at Parallaxer parity, with a
static side-view depth strip and coverage as text rows. What must not happen is building
the draggable depth editor in ScriptUI and then again in CEP.

**What the decision turns on** — three questions only Robin can weigh:

1. Is beating AnimateParallax on the visual axis part of "top choice", or is coverage
   tooling plus the finished shot enough? If the former, CEP; if the latter, ScriptUI is
   defensible.
2. How much does the unknown UXP path worry you, given that neither choice removes the
   risk and CEP moves the panel to a stack the co-pilot handles well?
3. Is the three-to-five-week difference material against the studio's own calendar?

The roadmap marks every item that waits on this decision.

## 8. Acceptance criteria: "better than Parallaxer 3 and AnimateParallax"

A build that meets all of these is better on every axis a buyer can see, not only on the
ones we care about.

**Parity (must match the pair)**

- Build from a plain layer selection with no renaming, depth from stacking order, in one
  click with no modal dialogs. Naming-convention build remains as the pipeline door.
- Frame 0 unchanged after Build on layers at non-100% scale, flipped, non-uniformly
  stretched, and with arbitrary anchor points - byte-exact on flat/gradient content,
  visually identical (sub-pixel) on raster. (Non-100% scale: FIXED in v1.4, proven by the
  SCALED FRAME-0 md5 lock and on real Battlemarked art. Flip / stretch / anchor: still to
  verify.)
- Absolute numeric depth per plane, always shown; Distribute and Random.
- Undo of any single action is one Undo step; nothing mutates outside a group.
- Non-destructive with a visible escape hatch: Reset restores the exact pre-build
  transform, not 100%.
- Works in a non-English After Effects; Windows and macOS; AE 2022–2026 on both renderers,
  with the suite run and the result stated in the changelog.
- Preflight blocks or warns on: parented, keyframed, locked, matted layers; a pre-existing
  camera; Advanced 3D renderer; duplicate names; comp resized since rig.

**Beyond (what the pair cannot do)**

- Per-plane coverage status for the chosen move and strength, with pixel counts.
- A "max safe strength" solve for all six moves, Pull-Back included.
- A visual band overlay on the canvas and a band-mask export (PNG, and PSD as a target for
  the paint pass) so the backfill is painted exactly where needed.
- A depth view the buyer can read from a screenshot; draggable if CEP.
- Six normalised moves with a global ease control and a start-time choice (t=0, CTI or
  work-area start); optional additive micro-motion.
- Batch: apply a build and a move across every comp in a folder from one command.

**Proof**

- The suite passes on the synthetic fixture and on every fixture variant in the
  architecture review §4.4 (scaled, parented, keyed, locked, user camera, matte, Advanced
  3D, non-square PAR, duplicate names, resize after rig, zoom change).
- A 60-second demo shows Build, one move, the coverage check and the band overlay. If the
  moat is not visible in the first minute, the tool is not ready.

## 9. Pre-aescripts checklist

Not a plan — a gate. Each item is either done or the submission waits.

1. Baseline captured on the synthetic fixture and committed as `_pxe_test/report.txt`.
2. All S1 defects from the architecture review closed; S2 closed or documented as
   limitations on the product page.
3. Localisation-safe: matchName-only ExtendScript, index-form expression lookups, a lint
   in the build that fails on display-name lookups and on `alert()` in the core, one manual
   pass in a second-language AE install.
4. Undo hygiene: every mutating entry point opens a group first and closes it in `finally`.
5. Rig identity by tag and `layer.id`, not by display name; renames of the null, the
   control names and the "Audit Band" label done *before* release, because renames after
   release cost a migration path forever.
6. Version single-sourced and stamped into core, panel, manifest and suite.
7. Licensing seam in place (`PXE.license`, swappable provider, suite runs with a stub) —
   never gate the core on a network call at load.
8. Trial limitation decided and implemented so the code path exists. The review's
   recommendation: full Build, Depth, Move, Preflight and Coverage on any comp; trial caps
   rigged planes and disables Bake and band-mask export; no render watermark.
9. Compatibility matrix stated and tested: AE 2022–2026, Windows and macOS (Intel and Apple
   Silicon), Classic 3D and Advanced 3D, both expression engines.
10. Two artefacts from one build with identical core bytes: the self-contained ScriptUI
    `.jsx` and, if CEP, the signed `.zxp`.
11. Release gate script: build, lint, run suite in AE, verify frames, package — one command,
    honest exit code. There is no CI with AE in it; this script is the CI.
12. Documentation furniture: a 3–5 minute overview video and a 10 minute "layered art to
    finished shot" walkthrough on YouTube linked from a Help button; a dated changelog; a
    written page on the reveal-band maths (the product's thesis).
13. Support plan: aescripts tickets answered within a business day; a release cadence that
    does not leave twelve months between updates.

## 10. Provenance

Successor to Z Space Controller v2 (whose three bugs — a layout jump on bake from
anchor-point re-scaling, wrong distribute ordering, and `valueAtTime(0)` fighting animated
drift — are fixed here). Takes whole-comp one-click convert and bake from the Parallaxer lineage and
range-based Distribute/Randomize thinking from AnimateParallax. Adds camera-move presets,
coverage maths, preflight and a scriptable core. The engine was developed inside
a studio pipeline and extracted as a standalone tool in September 2026; the design
principle of one motivated camera move per shot came with it and stands on its own merits.
