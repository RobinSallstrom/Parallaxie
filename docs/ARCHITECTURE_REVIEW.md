# Parallaxie — Architecture and Code Review (v1.2 core, 49-check suite)

*Prepared 2026-09-08 as a read-only review of the repository. Line numbers refer to
`Parallaxie_v1.jsx` (883 lines) at the decoupling commit `c4124db` unless another file is
named; that commit changed comments only, so the numbers still hold. Companion to
`docs/COMPETITIVE_ANALYSIS.md`; §5 and §6 build on its UI-technology and gaps sections.
Appendix B records what the decoupling commit changed after this review was written.*

**Verdict in one paragraph.** The core is small, readable and mathematically right where it
matters (projection lock, band geometry). It is also a *pipeline tool that happens to work on
one kind of input*: layers at 100% scale, unparented, unkeyed, unlocked, English-language AE,
Classic 3D renderer, one comp size for life, no pre-existing camera. Every one of those
assumptions is unchecked in code and untested in the suite, and every one of them is
violated by an ordinary aescripts buyer inside the first hour. The differentiator the
competitive analysis identified (coverage/reveal-band maths) is not reachable from the panel
at all. The re-alignment to a general-purpose product is therefore mostly *hardening plus a
UI*, not a rewrite; the module boundaries are already where they should be. But the current
expressions should not ship to strangers.

---

## 1. Architecture map

### 1.1 Shape of the code

One IIFE `parallaxie(thisObj)` (L11–865). Constants (L13–26), two expression strings
(L28–41), private helpers (L43–230), the public `PXE` object (L232–747), `$.global.PXE = PXE`
(L749), an early `return` when `$.global.PXE_HEADLESS === true` (L752), then a ~110-line
ScriptUI panel (L754–863) that is a thin skin over `PXE`. The public API is 20 functions;
every one returns a **string** beginning `"OK"` or `"ERROR"` (multi-line, warnings appended
after `\n`). The suite and the UI both parse these strings.

| Layer | What | Lines |
|---|---|---|
| Conventions | `NAME_RX /^(\d\d)_/`, `FX_TOKEN "_FX"`, `FOG_PREFIX "PXE_FOG_"`, rig layer names `PXE_Camera` / `PXE_CAM` (the *null* is the one called CAM) | 15–19 |
| Lens model | `zoomPx = width × 50/36` (50 mm on a 36 mm gate, in comp pixels) | 20, 164 |
| Per-layer controls | Slider `Z Space`, Point `Scale Center`, Point `P Base Position`, all added as native effects | 21–23, 196–200 |
| Expressions | `SCALE_EXPR`, `POS_EXPR` | 29–41 |
| Scene scan | `sceneLayers` (enabled NN_ or fog), `planesOnly` (NN_ minus FX minus fog), `riggedLayers` (anything with a `Z Space` effect) | 59–73, 152–158 |
| Diagnostics | `hiddenPlaneNames`, `nameStackRelation`, `twoDSplitters`, `misstackedFog`, `preflight` | 78–151, 670–718 |
| Rig | `ensureRig` (null + camera), `rigLayer`, `unrigLayer` | 166–213 |
| Depth ops | `buildFromComp`, `setDepth(s)`, `distribute(near,far,bias)`, `randomize` | 243–381 |
| Move | `applyMove` (six presets, eased keys on the null), `clearMove` | 385–418 |
| Atmosphere | `addFogCard`, `restackByDepth`, `restackFog` | 124–134, 424–452, 721–734 |
| QA | `auditOn/Off` (solo + jump to extreme), `bands`, `checkMove` | 456–488, 565–666 |
| Exit | `bake` (post-expression sample, strip), `reset` (back to 2D) | 491–530 |
| State | `PXE.far` (module-level mutable), `PXE._audit` (solo snapshot) | 235, 455 |

### 1.2 The camera/null rig

`ensureRig` (L166–186) creates, once per comp (found by *name*):
- `PXE_CAM`: a 3D null at `[cx, cy, 0]`, moved to the top of the stack.
- `PXE_Camera`: created with `addCamera(name, [cx,cy])`, `autoOrient = NO_AUTO_ORIENT` (so it
  behaves as one-node), zoom set to `zm`, parented to the null, then positioned at
  `[0, 0, -zm]` **in parent space** → world `(cx, cy, -zm)`.

All camera moves keyframe the null's position (L403–404); the camera itself never animates.
This is a good decision: the camera's rest pose is the geometric contract the expressions
rely on (see 1.3), and keeping it static means nothing the user does to the move can break
the lock.

### 1.3 The frame-0 lock — exactly what it is and what it depends on

AE's one-node camera at world `C = (cx, cy, -zm)` with zoom `zm` projects a world point
`(x, y, z)` to screen

```
S = (cx, cy) + ((x, y) − (cx, cy)) · zm / (zm + z)
```

At `z = 0` this is the identity, which is why 2D layers and z=0 3D layers render 1:1.

The rig places a layer at depth `z` (the `Z Space` slider) and applies two expressions:

- `SCALE_EXPR` (L29–33): `f = (zoom + z) / zoom`; scale = `[100f, 100f, 100]`.
- `POS_EXPR` (L35–41): position = `[sc + (bp − sc)·f, z]` where `sc` = Scale Center (comp
  centre at rig time, L199) and `bp` = the layer's flat 2D position captured at rig time
  (L200).

Take any pixel of the layer at offset `o` from its anchor (in layer space after the layer's
own rotation). World position: `sc + (bp − sc)·f + f·o`. Project: divide the offset from `sc`
by `f` → `bp + o`. That is exactly where the pixel sat in the flat comp, for every `o`, so the
lock is **independent of anchor point and 2D rotation** — the suite's tests 1.8/1.9 verify
the identity numerically and the md5 on `f_flat/f_built/f_push_t0` verifies AE's rasteriser
agrees byte-for-byte.

The lock holds *only* under these conditions, none of which the code checks:

1. **The layer's own scale is 100%.** `SCALE_EXPR` returns `[f, f, 100]` and discards `value`.
   A layer at 50% jumps to 100%·f on Build. (§3, #1.)
2. **The layer is unparented.** `bp` is captured from `l.position.value` (parent space if
   parented) while `sc` is comp space. (§3, #2.)
3. **The active camera is at distance `zoom` from the z=0 plane, on the axis through `sc`.**
   `SCALE_EXPR`/`POS_EXPR` read only `cam.zoom`, not the camera's position. The rig guarantees
   this at rest *for the camera it created, at the comp size that existed at rig time*.
   Change the camera zoom, resize the comp, or let another camera become active, and the
   lock silently breaks. (§3, #9–#11.)
4. **The renderer is Classic 3D** (`ADBE Picasso`). Byte-identity between a 2D layer and a
   scaled-then-projected 3D layer is a property of the Classic 3D rasteriser. Advanced 3D
   (default for new comps since AE 24.0) has its own antialiasing path. The md5 lock is
   untested there. (§3, #5.)

The "Base Position" point control replacing `valueAtTime(0)` (Brief, "ZSC bug #3") is the
right design: it makes the rig static and lets the *control* carry animation (fog drift,
L445–446) without the expression re-sampling its own past.

### 1.4 Depth from stacking order

`buildFromComp` default `order:"stack"` (L260–275): `planesOnly` sorted by `layer.index`
ascending; plane `i` of `n` gets `z = far · i/(n−1)`; top = 0 = nearest. Ties are impossible.
The NN_ numbers are demoted to metadata and only produce NOTEs when they disagree with the
stack (L271–275). `name-asc` / `name-desc` (L277–293) are the legacy paths where equal
numbers share a depth slot. `distribute` (L352–367) re-spaces rigged planes by index with a
power bias.

**FX layers** (`_FX` anywhere in the name, L50) are excluded from `planesOnly` and, after all
planes are rigged, given the depth of the first rigged non-FX NN_ layer *below* them in the
stack (L296–307). This binding exists only at Build time — see §3, #13.

### 1.5 Fog cards

`addFogCard` (L424–452): comp-sized solid, Fractal Noise, Screen, opacity, rigged as a plane
at `z`, Base Position given a sin/cos drift expression, then `restackByDepth` moves it below
the lowest-in-stack layer that is nearer than it. `misstackedFog`/`restackFog` re-check that
ordering. Note for §3, #14: the Fractal Noise parameter indices used are very likely wrong
and the `try/catch` around them hides it.

### 1.6 Audit mode

`auditOn` (L456–478): snapshot `{layer, solo}` for every layer **by reference** (the v1.1
fix), solo the target + camera + null, jump `comp.time` to the last move key (or last frame).
`auditOff` restores. No undo group; the comp id is stored but never checked.

### 1.7 Bake / Reset

`bake` (L491–510): read `scale.value`/`position.value` (post-expression), clear expressions,
`setValue` the sampled values, remove the three effects. `reset` (L513–530): remove
effects/expressions, scale `[100,100,100]`, position `[bp, 0]`, `threeDLayer = false`. Both
call `setValue` on properties that may carry keyframes — see §3, #3.

### 1.8 Geometry module (v1.2)

`dollyFor`/`lateralFor` (L534–545) reproduce `applyMove`'s numbers so the analysis and the
move cannot drift apart — good. `magAt(zm, z, dz) = (zm+z)/(zm+z−dz)` is the screen
magnification of a plane after a dolly `dz`. `flatRect` (L552–559) is the layer's footprint
in the flat frame via `sourceRectAtTime(0)` + anchor + Base Position.

- `bands` (L565–601): per adjacent plane pair (sorted by z), lateral band
  `= |d|·zm·(zf−zn)/((zm+zn)(zm+zf))`; radial band `= r_corner · |m(zn) − m(zf)|`. Both
  correct; the README's warning about the shorthand is right.
- `checkMove` (L605–666): for each **full-frame plate** (cut-outs are skipped, L622–625 —
  correct reasoning), project the flat rect through the move and report negative margins.
  Lateral moves also solve the first-failure strength analytically (L646–657). Pull-Back is
  radial and *does* expose, but gets no first-failure solve and the comment at L645 ("push
  never fails") is only true for Push-In.

`applyMove` strength semantics (L392–393): dolly `dz = s(zm+mz)/(1+s)` makes the mean-depth
plane grow by exactly `s`; pull-back `−s(zm+mz)/(1−s)` shrinks it by exactly `s`. Verified
algebraically; this normalisation is real and, per the competitive analysis, worth marketing.

---

## 2. Coupling inventory

This section records how the engine was coupled to the studio pipeline it came from, and
what the decoupling commit of 2026-09-08 (`c4124db`) did about it. Classification:
**remove** (delete before any public release), **generalize** (keep the idea, strip the
studio specifics), **keep-as-optional** (developer-only or provenance; fine if isolated).
**Status** is as of that commit.

### `Parallaxie_v1.jsx`
| Lines | What | Class | Status |
|---|---|---|---|
| 2 vs 14 | Header said v1.0, `VERSION = "1.2"` | generalize (single source of truth, generated) | header fixed to 1.2; single-sourcing still open |
| 4 | Author line, "successor to Z Space Controller v2" | keep-as-optional (provenance) | kept |
| 15–16 | `_FX` token and `NN_` regex as the *only* build door | generalize → selection-based build default, naming rule configurable | open (roadmap Phase 2) |
| 21–23 | Effect names `Z Space` (ZSC-v2 compatible), `Scale Center`, `P Base Position` | generalize: the ZSC compatibility is not real (§3 #8); pick product names, migrate by matchName-free lookup | open (rename before shipping) |
| 89, 273, 697 | "the 01_SKY house convention" | generalize wording | done ("convention") |
| 237–242 | pipeline framing of how the frame was composited | generalize | acceptable as is |
| 331 | `setDepths` example used a studio character name | remove | done (`09_HERO`) |
| 350–351 | comment described a specific studio shot | remove | done (generic) |
| 561–564 | "The doc shorthand …" referred to an internal playbook | generalize | done ("the common shorthand") |
| 668–669 | "before you spend a render or a … credit" — a generative-fill step from the studio's paint pass | remove | done ("a render") |
| 839 | Button label "Audit Band" — internal playbook jargon | generalize ("Inspect plane") | open (UI phase) |

### `PXE_SmokeTest.jsx`
| Lines | What | Class | Status |
|---|---|---|---|
| 4, 55–58, 64 | Required a proprietary 161 MB layered PSD beside the script; imported as comp; matched the comp by name prefix | remove → synthetic fixture (§4.4) | done (`PXE_Fixture.jsx`; see Appendix B) |
| 52 | `PXE.version === "1.2"` literal | generalize (read from build metadata) | open |
| 79–80, 116, 124, 162, 222, 237, 242, 265, 267, 276 | Layer names `01_SKY_PLATE`, `02_GATE_PLATE`, `03_NEAR`, `05_FX_PortalGlow` | keep as fixture names — but *created* by the fixture, not imported | done |
| 210–212, 334–335 | Comments referring to the studio's real plates | generalize | done |
| 16–18 | `_pxe_test/` beside the script via `$.fileName` | keep, but see §6.1 | kept |

### `tools/ae_send.py`
| Lines | What | Class | Status |
|---|---|---|---|
| 1–10 | Whole file is an adb-mcp client | keep-as-optional (dev harness; never shipped) — but add a bridge-free backend (§6.3) | kept; docstring reframed as optional; bridge-free backend open |
| 13 | Hardcoded personal macOS path to the bridge | generalize (env var) | done (`PXE_ADB_MCP_PATH`, fallback `ADB_MCP_PATH`) |
| 18 | `PROXY_URL = "http://localhost:3001"` | generalize (env var) | open (two-line change) |

### `tools/verify_frames.py`
No studio coupling. L46–47 resolves `../_pxe_test` from its own location — keep; already
accepts a directory argument.

### Prose: `CLAUDE.md`, `README.md`, `Parallaxie_Brief.md`
Studio positioning, PSD-fixture instructions, the bridge presented as a requirement, a scope
paragraph pointing at the originating pipeline repo, a stale depth description ("lowest
number = Far" — stale since v1.1), a reference to another studio's film as "the look", and a
claim that ZSC-v2-rigged layers are "recognized … adopted/migrated by Build" (false — §3 #8).
**Status:** all three rewritten on 2026-09-08. The ZSC adoption claim was removed rather than
implemented.

### `docs/EXTRACTION_NOTES.md`
Entirely about the originating pipeline and studio-owned files. **Status:** deleted.

### `.gitignore`, `_pxe_test/report.txt`
`.gitignore` carried a comment about the studio PSD — generalized (still ignores `*.psd`).
`report.txt` echoed the old fixture's dimensions (2480×3509), hidden-layer names and band
numbers. **Status:** renamed to `_pxe_test/report_baseline_v1.2_legacy-fixture.txt` and kept
for history; a fresh baseline must be captured on the synthetic fixture (Appendix B).

Nothing in the engine referenced the originating studio's tools or personal paths directly;
the coupling was (a) the test fixture, (b) the harness path, (c) prose. That is good news:
the extraction already isolated the engine correctly, and the decoupling commit closed (a),
(b) and most of (c). The remaining coupling is *conceptual*: the NN_ convention as the sole
entry point, and the vocabulary (bands, backfill, audit) that only makes sense once the
reveal-band maths has been explained.

---

## 3. Code quality review — ranked

Severity: **S1** = will break the lock or destroy user work in ordinary use; **S2** = wrong
result in a plausible setup, or silent failure; **S3** = polish. "Week one" means an
aescripts buyer hits it before writing a review.

### S1

**1. `SCALE_EXPR` discards the layer's existing scale (L29–33; `reset` hard-codes 100 at L523).**
Any layer not at exactly 100% — a plate scaled to fit the comp, a flipped layer (−100), a
non-uniform stretch — is set to `100·f` on Build. At z=0 that is a jump to 100%; the frame-0
lock fails on the very first real-world file. The original PSD-based fixture never showed
this because importing with layer sizes retained puts every layer at 100%, and the synthetic
fixture's solids are at 100% too. Fix: `s = value; [s[0]*f, s[1]*f, 100]` (as autoParallax
does), or capture a `Base Scale` control the way Base Position is captured. Baking then
samples the product. `reset` must restore the captured base, not 100. **Week one, certain.**

**2. Parented layers: the position expression mixes coordinate spaces (L35–41, L192, L199–200).**
`bp` is read from `l.position.value`, which is *parent space* when a parent exists; `sc` is
comp space; the expression writes parent-space position. A child of a controller null offset
from the comp centre jumps, and the parent's scale multiplies the child's on-screen size on
top of `f`. Fix options, in order of preference: (a) preflight BLOCKER + "Unparent (keeps
transform)" via `l.parent = null` (AE adjusts the child's transform to preserve its apparent
position — unlike `setParentWithJump`); (b) evaluate in comp space inside the expression
using `toComp`/`fromComp` — heavier, slower, and still wrong for parents that animate. Take
(a). **Week one for anyone who uses controller nulls, i.e. every motion designer.**

**3. Pre-existing position/scale keyframes are silently overridden, then break Bake/Reset (L192, L203–204, L500–503, L523–524).**
Build captures `position.value` *at the current CTI* (not t=0) as the base and puts an
expression over whatever keyframes exist — the artist's animation is dead with no warning.
Then `bake`/`reset` call `Property.setValue()` on those properties; AE throws on a keyframed
property ("setValue … generates an exception if the property has keyframes"). The `catch`
returns `ERROR` mid-loop with some layers stripped and some not, inside one undo group. Fix:
preflight BLOCKER for `position.numKeys || scale.numKeys` on candidate layers, and Bake must
use `setValueAtTime`/remove keys explicitly if it is ever allowed on keyed layers.

**4. Locked layers abort Build half-way (L190, L268–269, L291–292).**
`l.threeDLayer = true` on a locked layer throws; the `catch` returns `ERROR rigging 'X'` and
leaves the layers before it rigged. `preflight` never reads `l.locked`. Same class:
`l.enabled === false` layers are already reported; `shy` is irrelevant; `locked` is the one
missing.

**5. Renderer assumption: nothing checks `comp.renderer` (nowhere).**
New comps in AE 24+ default to Advanced 3D. The lock's byte-identity, the 2D-group-split
behaviour, and blend-mode compositing of the fog card are all Classic-3D-verified only. Add
to preflight: `comp.renderer !== "ADBE Picasso"` → WARN with a one-click "Switch to Classic
3D", and run the whole suite once under `ADBE Advanced 3d` to learn what actually differs.
Until that run exists, the md5 invariant is a claim about one renderer.

**6. Localisation: display-name property lookups (ExtendScript L55–56, L445, L504, L521, L555; expressions L31, L37–38; suite L83, L101, L155, L157, L252, L313).**
`("Slider")` and `("Point")` are localized display names ("Schieberegler", "スライダー"). On a
non-English AE the ExtendScript paths throw and the expressions error on every rigged layer.
The code already knows the matchNames — L199–200 use `"ADBE Point Control-0001"` — it just
doesn't use them consistently. Fix: in ExtendScript use matchNames everywhere; in expressions
use the index form `effect("Z Space")(1)` (custom effect names are user strings and are not
localized, so `"Z Space"` itself is safe). Add a lint step to the build that fails on
`("Slider")`/`("Point")`. ParaLight's one-star reviews (competitive analysis §2) are exactly
this defect.

**7. Undo hygiene (several places).**
- `applyMove` calls `ensureRig` at L387 *before* `beginUndoGroup` at L399: first move on an
  unrigged comp creates camera+null outside the group; Undo removes the keys and leaves the
  rig.
- `clearMove` (L411–418) has no group when called from the UI (L825) — N `removeKey` calls
  plus a `setValue` become N+1 undo steps.
- `auditOn/auditOff` (L456–488) have no group; N solo toggles per call land on the undo stack.
- `setDepth`, `distribute`, `randomize` (L325–327, L361–364, L373–379) have groups but no
  `try/finally`; an exception leaves the group open and every subsequent AE action is
  swallowed into "PXE Depth".
- UI slider `onChanging` (L803) calls `setZraw` on every drag tick → hundreds of undo entries
  per drag. Use `onChange` for the commit, or open one group on the first `onChanging` and
  close it in `onChange`.
Rule: every mutating entry point does `beginUndoGroup` first, `try { … } finally { endUndoGroup }`,
and nothing mutates before `begin`.

**8. Build is destructive on re-run, and the ZSC-v2 "adoption" is broken (L193–202, L52–54).**
`rigLayer` always calls `setZraw(l, depth)` (L202), so pressing Build twice wipes every
hand-tuned depth. The old Brief claimed ZSC-rigged layers are "recognized … adopted/migrated":
`isRigged` tests only for a `Z Space` effect; a genuine ZSC v2 layer has that slider but no
`Scale Center`/`P Base Position`, so the `!isRigged` branch is skipped, the two point
controls are never added, and both new expressions error. Fix: `isRigged` must check all
three controls; already-rigged layers keep their z unless `opts.reassign`; a real migrate
path adds the missing controls and captures bases from the *current post-expression screen
position*.

**9. The panel throws warnings away (L762).**
`say()` shows `split("\n")[0]`. The hidden-layer WARN that v1.1 exists to surface
(L256–257), the 2D-splitter WARN (L311–312), and the NOTEs are all invisible to a panel
user. For the panel user, v1.0's silent behaviour is back. Warnings need a multi-line,
persistent status area (or a log).

### S2

**10. Comp resize after rig (L167, L189, L416).** `Scale Center` and the null were computed
for the comp size at rig time. `clearMove` snaps the null to the *new* centre → camera axis
moves off `sc` → lock breaks. `ensureRig` on a resized comp will find the old rig by name and
trust it. Store the rig centre on the null (e.g. a Point control "PXE Rig Center") and read
it back; on mismatch, offer "Re-centre rig (re-captures bases)".

**11. Camera zoom is not tied to camera distance (L180–182).** A user who changes focal
length for a wider look breaks the lock. Put `[0, 0, -cameraOption.zoom]` as an expression
on the camera's position (parent space) and the lens becomes a legitimate *feature* ("Lens:
24/35/50/85 mm" changes parallax intensity vs. edge exposure) instead of a trap. `zoomPx`
then reads the camera, not the constant.

**12. `thisComp.activeCamera` assumptions (L30, L39, L709–711).** (a) Pre-existing cameras:
`ensureRig` puts `PXE_Camera` at the top so it wins, silently disabling the user's camera;
preflight only warns *after* the fact and only if `PXE_Camera` isn't active. Warn at Build.
(b) Rigged layers copied to another comp, or the camera deleted/trimmed, leave `cam` null (or
the default camera — verify) and every expression errors. Guard:
`var cam = thisComp.activeCamera; var zm = (cam && cam.zoom) ? cam.zoom : thisComp.width*50/36`.
(c) Camera in/out points shorter than the comp change which camera is active per frame.

**13. FX co-planarity exists only at Build (L296–307; `distribute` L357, `randomize` L372, `setDepth` L321).**
After any depth op on a plane its FX riders stay behind. Either link FX z by expression to
the host plane (`thisComp.layer("host").effect("Z Space")(1)` — or better a
layer-index-independent link via a "PXE Host" text/name stored in a control), or re-resolve
FX after every depth op. Also: an FX layer with no rigged plane below it gets `z = 0`
(nearest) at L305 — should fall back to the nearest plane *above* or to `far`.

**14. Fog card Fractal Noise parameters are probably wrong and the `try/catch` hides it (L436–440).**
In Fractal Noise, `-0003` is likely *Invert*, `-0004` *Contrast*, `-0005` *Brightness*,
`-0010` *Scale*, and *Evolution* is `-0022`. If so the card gets Invert forced on (120 →
truthy), Contrast −25 (out of range → throws → the rest of the block, including the
evolution expression, never runs). Test 4.2 checks only existence/Screen/z, so a static,
inverted fog passes. Verify in one line:
`for (var i=1;i<=fn.numProperties;i++) $.writeln(fn.property(i).matchName+" "+fn.property(i).name)`.
Then drop the `try/catch`; a fog card that doesn't evolve is a bug, not an acceptable
fallback.

**15. Restack logic may be solving the wrong problem (L124–151, L721–734).** In a single
Classic 3D render group AE sorts 3D layers by camera distance, not stack order; stacking only
breaks ties. If fog cards visibly "Screened over every plane in front", the likely root
causes are a 2D layer splitting the group (which v1.1 also discovered), or a
layer-style/track-matte exception forcing stack-order compositing. Verify with a
three-solid experiment before carrying `misstackedFog`/`restackFog` into v2; if they are
needed, `restackFog`'s downward iteration skips the layer directly above each moved card
(moving card `i` up shifts old `i−1` to `i`, which the loop has already passed).

**16. Name-keyed everything (L160–163; API L321, L333, L456; rig lookup L168, L176).**
Duplicate layer names are legal and common ("Layer 1" ×6 from a flattened PSD group; two
"shadow" layers). `findLayer` returns the first. Renaming `PXE_CAM` makes `ensureRig` build a
second rig. Key internal references by `layer.id` (AE 22+; `app.project.layerByID`), tag rig
layers with a marker/comment (`PXE:rig`) rather than by name, and let the API accept id,
index, or Layer object with name as a convenience only.

**17. `checkMove` for Pull-Back (L645–664).** Pull-Back shrinks every plate radially and
*does* expose; the EXPOSES lines print, but there is no first-failure solve and no summary
line. The solve is closed-form: for a plate with margins `(gL, gT, gR, gB)` around the
centre, failure when `m(z) < 1 − margin/half-extent`; invert `magAt` for `dz`, then `s`. The
competitive analysis's "Max safe strength" button needs this for all six moves.

**18. `allowHidden` is misleading (L256, L63).** It suppresses the warning; it does not rig
hidden layers (`sceneLayers` drops `!l.enabled` unconditionally). Either rename to
`quietHidden` or actually implement "rig hidden layers too".

**19. `activeItem` semantics (L44–47).** `app.project.activeItem` is the Project-panel
selection when that panel has focus, `null` when several items are selected, and not
necessarily the comp in the viewer. Every API call resolves the comp independently, so a
Build and the following `setDepth` can target different comps if focus moved. Accept an
explicit `comp` (or comp id) on every API function; the UI resolves once per action and
passes it.

**20. Track mattes and disabled matte layers.** A matte layer is normally video-off, so
`sceneLayers` skips it (or reports it as "hidden NN_"); its fill layer is rigged and moves in
Z while the matte stays 2D at 100% → the matte tears on the first frame of the move.
Preflight must check `trackMatteType !== NONE` (or `hasTrackMatte`/`matteLayer` on AE 23.0+)
and either rig the pair together or block.

**21. `PXE._audit` ignores `compId` (L467, L480–486).** Switch comps between `auditOn` and
`auditOff` and the wrong comp's time is set. Trivial fix: compare and refuse.

**22. `PXE.far` is hidden mutable state (L235, L245, L355).** The last Build's `far` leaks
into `distribute` defaults for a different comp. Store per-comp (on the null) or require the
argument.

**23. `applyMove` always starts at t=0 (L402–404).** Buyers expect a move to start at the CTI
or the work-area start, and to fit the work area. Keys at absolute 0 also ignore
`displayStartTime` expectations. Parameterise `t0`.

### S3

- Version string: the suite hard-codes "1.2" (test L55); single-source it.
- Naming: the *null* is `PXE_CAM`, the camera is `PXE_Camera`. Rename the null (`PXE_Rig`),
  tag by comment, migrate by tag.
- String protocol (`"OK…"`/`"ERROR…"`): fine for an LLM, poor for a UI or for tests. Return
  `{ok, msg, warnings:[], data:{}}` (JSON-stringifiable; ES3 has no `JSON` — ship a tiny
  serializer) and keep a `toString()` for humans.
- Modal `confirm()` in the panel (L847, L851) — the competitive analysis lists modal chains
  as the thing to avoid; make Bake/Reset undoable and skip the dialog, or use a non-modal
  "Are you sure" second click.
- `meanPlaneDepth` returns a magic 1000 when nothing is rigged (L229).
- `isFx` substring test (L50) will match `_FXTURE`-style names; anchor it (`/_FX(_|$)/i`).
- `hiddenPlaneNames` (L78–86) counts FX layers as planes; harmless but inconsistent with
  `planesOnly`.
- Expressions use implicit globals (`cam = …`); add `var`. Works in both engines today; costs
  nothing.
- `randomize` clamps at 0 only, not at `far` (L377).
- `reset` and `bake` leave the fog solids' footage items in the project's Solids folder.
- `refreshList` rebuilds the whole ScriptUI list on every refresh (L790–808) — fine for <50
  planes; will flicker on Windows.
- The panel has **no Preflight, no checkMove, no bands, no setDepths, no per-move ease**. The
  rules in `CLAUDE.md` ("run preflight first, every time") cannot be followed from the UI at
  all.

### Performance
Nothing here is slow at realistic layer counts (`misstackedFog` is O(n²) over rigged layers;
`restackByDepth` O(n) per card). The only felt cost is the expression re-evaluation and
viewer redraw on every slider tick, which is inherent and is the same in ScriptUI and CEP;
throttle drags to ~10–15 Hz.

### Things that are fine and should stay
Anchor/rotation independence of the lock; null-driven moves; strength normalisation; Base
Position as the animation carrier; stacking order as depth authority;
`sourceRectAtTime`-based coverage; `try/finally` on the big functions; no `alert()` in the
core; the headless flag.

---

## 4. Test suite review

### 4.1 What the 49 checks actually cover
Loading (0.x); Build creates rig and 3D planes, depth ordering, FX co-planarity, numeric lock
identity for one layer, scale compensation (1.x); one `setDepth` keeps the identity (2.x);
Push-In creates two eased keys and the near plane grows more (3.x); fog card exists/Screen/
drifts (4.x); audit solos and restores (5.x); bake strips and doesn't move one layer (6.x);
undo restores, reset flattens (7.x); v1.1 defences — preflight reports hidden layers, build
WARNs, stack order beats numbering, fog colour + restack, distribute bias, audit survives
layer-count change, 2D splitter detected (8.x); band formulas, push radial, checkMove
clear/expose/first-failure (9.x). Frame md5s (`verify_frames.py`) prove flat == built ==
push_t0 and prebake == postbake.

The suite is a good *regression* suite for the paths the author walked. It is not a
*coverage* suite for the input space.

### 4.2 What it misses (maps to §3)
Non-100% scale; parented layers; keyframed position/scale; locked layers; track mattes;
existing camera; no-camera/copied layers; comp resize after rig; camera zoom change; Advanced
3D renderer; localisation (cannot be run headless, but a static lint can be); undo-group
integrity for `applyMove` on an unrigged comp, `clearMove`, `auditOn`; Build idempotence
(depth preserved on re-run); ZSC-style partial rig; `name-asc`/`name-desc`; `setDepths`;
`restackFog`; `status`; the five non-Push moves (`applyMove` is tested with Push-In only;
`bands`/`checkMove` with Drift L and Push-In only); Pull-Back exposure; fog Fractal Noise
parameters actually applied (read back `Contrast`); FX following its plane after
`distribute`; FX with nothing below; `allowHidden`; multi-comp `activeItem`; non-square PAR
(the lock should hold — the maths is in pixel units — but it is unproven); a layer at a
fractional position (does the *byte* lock survive sub-pixel placement in Classic 3D?
unknown).

### 4.3 How tightly it was bound to the old fixture
Hard: file name and import mode, comp name prefix. Soft but real: layer names `01_SKY_PLATE`,
`02_GATE_PLATE`, `03_NEAR`, `05_FX_PortalGlow` at eleven sites; the *stack arrangement* those
names imply (top→bottom: `03_NEAR`, `05_FX_PortalGlow` directly above `02_GATE_PLATE`,
`01_SKY_PLATE` at the bottom — test 1.7 requires the glow to sit immediately above the gate
with no other NN_ non-FX plane between); at least one hidden NN_ layer present before 8.2
(the legacy report shows three); `01_SKY_PLATE` full-frame with zero bleed (9.5's output).
**Not** asserted: dimensions (2480×3509 appeared only in logs), layer counts ("7 layers / 3
depth planes", "index 13 of 17", "baked 8"), any pixel colour. So the assertions are
relational, and a synthetic fixture that reproduces the arrangement passes them without
edits beyond the load block — which is what the decoupling commit did.

### 4.4 Synthetic fixture — the design as proposed

*Implemented on 2026-09-08 as `PXE_Fixture.jsx` (a sibling of the suite, not `tests/fixture.jsx`)
with five deliberate deviations; see Appendix B. The design is kept here because the
variants list at the end is the Phase 1 test plan.*

Goal: `PXE_SmokeTest.jsx` runs from a fresh project with **no external files**; frame PNGs
still written for `verify_frames.py`.

```js
// tests/fixture.jsx — exposes $.global.PXE_FIXTURE.make(opts) -> CompItem
// Deterministic, no Math.random, all matchNames, no display names.
function make(opts) {
  opts = opts || {};
  var W = opts.width || 1920, H = opts.height || 1080, par = opts.par || 1;
  var comp = app.project.items.addComp("PXE_TEST", W, H, par, 6, 24);
  if (opts.renderer) comp.renderer = opts.renderer;            // "ADBE Picasso" | "ADBE Advanced 3d"
  function solid(name, w, h, rgb, pos, enabled) { var l = comp.layers.addSolid(rgb, name, w, h, 1, comp.duration);
    if (pos) l.position.setValue(pos); if (enabled === false) l.enabled = false; return l; }
  function grid(l, size, rgb) { var g = l.property("ADBE Effect Parade").addProperty("ADBE Grid");
    // set size-from / width / colour via matchName indices, verified once by dumping fn.property(i).matchName
    return g; }
  function ramp(l, a, b) { var r = l.property("ADBE Effect Parade").addProperty("ADBE Ramp"); /* start/end colour */ return r; }

  // Bottom → top (addSolid inserts at the TOP, so add far-to-near):
  var sky      = solid("01_SKY_PLATE",        W,      H,      [0.15,0.25,0.45], null);          // zero bleed, full frame
  ramp(sky, [0.1,0.2,0.5], [0.6,0.7,0.9]);                                                        // texture: a uniform plate would make push_end == flat
  var skyFill  = solid("01_SKY_bandfill",     W+200,  H+200,  [0.1,0.2,0.4],   null, false);     // hidden NN_ (test 8.2/8.3 need ≥1 hidden)
  var split2D  = solid("WATERMARK_2D",        300,    60,     [1,1,1],         [W-170, H-50]);   // enabled 2D non-NN_ layer: splits the 3D group (WARN path exercised on every Build)
  var gate     = solid("02_GATE_PLATE",       W+280,  H+160,  [0.35,0.3,0.25], null);            // full frame WITH bleed (140/80 px) — CLEAR on 5% drift
  grid(gate, 120, [0.6,0.5,0.4]);                                                                 // texture for parallax visibility
  var gateFG   = solid("02_GATE_FG",          800,    500,    [0.3,0.25,0.2],  [W*0.7, H*0.6], false);   // hidden NN_
  var gateFill = solid("02_GATE_nearbandfill",W+400,  H+200,  [0.3,0.3,0.3],   null, false);     // hidden NN_
  var glow     = comp.layers.addShape(); glow.name = "05_FX_PortalGlow";                         // FX rider: must sit directly above 02_GATE_PLATE
  /* add an ellipse group + fill via matchNames: "ADBE Vector Group" > "ADBE Vectors Group" > "ADBE Vector Shape - Ellipse", "ADBE Vector Graphic - Fill" */
  glow.blendingMode = BlendingMode.ADD;
  var nearL    = solid("03_NEAR",             1100,   700,    [0.1,0.1,0.1],   [W*0.35, H*0.65]); // CUT-OUT (not full frame) → checkMove skips it as cut-out
  return comp;
}
```

Stack after construction (top→bottom): `03_NEAR`, `05_FX_PortalGlow`,
`02_GATE_nearbandfill`(off), `02_GATE_FG`(off), `02_GATE_PLATE`, `WATERMARK_2D`,
`01_SKY_bandfill`(off), `01_SKY_PLATE`. Walking the current assertions against it:

- 1.4–1.7: three planes rig; stack order gives near=0, gate=2500, sky=5000; FX search "first
  rigged non-FX NN_ *below*" skips the two disabled layers and lands on the gate →
  co-planar — passes.
- 1.8/1.9, 2.x: lock identity is geometry, independent of content — passes.
- 3.x: push growth — passes; `f_push_end != f_flat` requires texture on at least one full-frame
  plate — the ramp/grid do that (a uniform solid renders identically after a push).
- 4.x, 8.5–8.6: fog card at 2000 restacks below `03_NEAR` — passes (assertion is index-relational).
- 8.2/8.3: hidden NN_ present — passes; hiding `03_NEAR` adds a fourth.
- 8.9: the suite still adds and removes its own `PXE_TEST_2D_SPACER`; the fixture's
  `WATERMARK_2D` additionally appears in every preflight (assert on its presence in a new
  1.10 check so the WARN path is exercised from Build #1). Note test 1.1
  (`indexOf("OK") === 0`) still passes with the WARN on line 2 — but *this* is where §3 #9
  also gets fixed, asserting that the UI-facing structure carries the warning.
- 9.2: `rigZ[0] === 0` after distribute — passes. 9.5–9.7: the suite adds its own zero-bleed
  `00_TEST_PLATE` — passes; the fixture's `01_SKY_PLATE` is also zero-bleed, so 9.5's output names
  both — assertion only requires `00_TEST_PLATE` — passes.

Replace the suite's load block with: `$.evalFile(here + "/fixture.jsx"); var comp =
$.global.PXE_FIXTURE.make(); comp.openInViewer(); saveFrame(comp, 0, "f_flat.png")`.
Everything after is untouched. Frame md5s remain valid because `verify_frames.py` compares
frames *within one run* (text-layer fonts would vary per machine — the design above uses no
text layers for exactly that reason).

**Fixture variants for the missing coverage** (each a flag on `make`, each a new test
section — 10.x onward): `scaled: true` (gate at 50% and near at [-100,100]) → lock must
hold; `parented: true` (near parented to an offset null) → preflight BLOCKER, unparent path;
`keyed: true` (two position keys on sky) → preflight BLOCKER, bake refuses cleanly;
`locked: true` → BLOCKER, Build does not partially rig; `userCamera: true` → WARN at Build,
lock still holds; `matte: true` (near as alpha matte for a fill) → BLOCKER;
`renderer: "ADBE Advanced 3d"` → whole suite re-run, learn the diff; `par: 1.21` → lock;
`duplicateNames: true` → id-based API works; a "resize after rig" step
(`comp.width += 200; PXE.clearMove()`) → lock; a "zoom 35 mm" step → lock (after §3 #11).
Plus the five untested moves through `applyMove`/`bands`/`checkMove`, Pull-Back exposure, FX
following `distribute`, Build idempotence, ZSC partial rig, and a **static lint** in
`tools/build.py` that fails on `("Slider")|("Point")` and on `alert(` inside the core.

Run cost: the whole thing is a few seconds in AE; the PNGs dominate. Keep the md5 lock at
8 bpc on the 1920×1080 fixture and add a *tolerant* secondary check (max abs diff ≤ 1 LSB) so
that a renderer change gives information instead of a binary FAIL.

---

## 5. UI technology — engineering recommendation

**Recommendation: build the public panel as a CEP extension over the existing ExtendScript
core, and keep the current ScriptUI panel alive as the fallback/lite UI.** Reasoning, then the
fallback. The decision itself is the owner's; `Parallaxie_Brief.md` §7 sets this view beside
the market view.

### What the panel actually has to do
1. A **depth view you can read *and drag***: planes as bars/thumbnails on a Z axis, camera at
   the left, coverage status per plane (green/amber/red) and the exposed-band width — this is
   the AnimateParallax axis and the only screenshot that wins the aescripts listing
   (competitive analysis §3, §4).
2. **Coverage tooling made visible**: "max safe strength", per-plane EXPOSES with pixel counts,
   an on-canvas band overlay (a guide shape layer created by the core — technology-agnostic).
3. **Live preview**: this is *AE's viewer*, driven by `setValue` calls; both technologies get
   it for free, and both have the same throttle/undo-group problem while dragging.
4. Build/Depth/Move/Fog/Bake buttons with non-modal, multi-line status. Trivial in either.

### Why CEP
- Item 1 is a canvas/SVG problem. In ScriptUI it is `onDraw` with
  `graphics.rectPath/fillPath/drawString` plus `addEventListener("mousedown|mousemove|mouseup")`
  on a group. It *can* be done (people have), but it is ~3× the effort, looks dated, and
  renders differently on Windows and macOS; hit-testing, hover states and text metrics are
  all hand-rolled. In CEP it is a `<canvas>` or SVG with ordinary DOM events; a coverage bar
  is a `<div>`.
- **Solo developer with an LLM co-pilot**: the co-pilot is dramatically stronger at
  HTML/TypeScript/React-or-Svelte than at ScriptUI's undocumented layout quirks, which
  usually need a screenshot to debug. Bolt-CEP (Vite + TS + hot reload + Chrome DevTools
  attached to the panel) is a normal web dev loop. This is the largest practical multiplier
  in the decision.
- The core/UI split already exists: the CEP side calls
  `csInterface.evalScript('PXE.call(' + JSON.stringify(req) + ')', cb)`; the core stays ES3
  and is `$.evalFile`d once from `SystemPath.EXTENSION + "/jsx/pxe-core.jsx"`. The core needs
  one addition — a JSON-in/JSON-out dispatcher (`PXE.call`) — which also improves the
  ScriptUI panel and the test suite.
- AE compatibility: CSXS 11 manifest covers AE 22.0 (2022) through 2026 with
  `<Host Name="AEFT" Version="[22.0,99.9]"/>`. That matches AnimateParallax's 2023+ and is
  one version wider. AE ≤ 2021 is lost, which is not a market.
- aescripts' Manager App installs ZXPs and their licensing framework supports CEP/JS; both
  competitors' trials ("same installer, limited until licensed") come with it.
- Perceived polish: at the $39–49 price point buyers read "product" from a CEP panel and
  "script" from ScriptUI (competitive analysis §5 table).

### What CEP costs
- Packaging: `ZXPSignCmd -selfSignedCert … -sign` with a free self-signed p12; `.debug` file
  + `PlayerDebugMode` flag for development; testing on both OSes. About a day to set up
  once, and a build script forever.
- Bridge latency: `evalScript` is async, serialised on AE's main thread, ~1–5 ms per call; a
  drag must be throttled to ~10–15 Hz and wrapped in **one** undo group (begin on drag start,
  end on mouseup, with a watchdog that closes the group after ~2 s of silence so a lost
  mouseup cannot leave AE swallowing every action into "PXE Depth"). Same problem exists in
  ScriptUI; CEP just makes it explicit.
- Longevity: CEP has an *eventual* sunset (Premiere first; AE unannounced, "a good while
  longer" — competitive analysis §5). UXP panels for AE do not exist in 2026. If/when they
  do, the UI is a rewrite of the HTML shell's host bindings, and — crucially — it is **not
  guaranteed** that a UXP panel will be able to drive an ExtendScript core. So "the core
  survives any UI change" is true for ScriptUI↔CEP and *unknown* for UXP. The mitigation is
  the same either way: keep the core's logic in pure functions over plain data (layer
  descriptors, depths, comp geometry) and keep the AE-DOM adapter thin, so a port to a UXP
  scripting DOM is mechanical. ScriptUI does not remove this risk; ExtendScript itself has no
  announced end date but the same Adobe.
- Time: +3–5 weeks over ScriptUI for a panel with the depth graph and coverage view.

### Fallback
Ship the existing ScriptUI panel first, *internally*, as "Parallaxie Lite": it already exists,
it is what studio use needs this quarter, and it exercises the JSON API about to be added. If
the CEP build slips, Lite is a saleable v1 at Parallaxer parity ($29–39), with the depth view
as a static `onDraw` side-view strip (no drag) and coverage as text rows. Several successful
aescripts tools shipped ScriptUI and moved to CEP at a major version. What must not happen is
building the visual depth editor in ScriptUI first *and then* porting it: that is the same UI
written twice.

### Sequence
1. Core hardening (§3 S1 + JSON dispatcher + id-keyed references) and the synthetic suite
   (§4) — these are prerequisites for *any* UI and for the aescripts submission.
2. ScriptUI Lite rebinds to `PXE.call`; gains a Preflight button and a multi-line status.
   Studio use starts here.
3. CEP panel (Bolt-CEP, TypeScript, Svelte or React — whichever the co-pilot produces most
   reliably; the panel is small) with depth graph, coverage, move controls. This is the
   aescripts product.
4. Watch for UXP-for-AE; do nothing until Adobe ships panels.

---

## 6. Proposed v2 layout and pre-submission engineering

### 6.1 Repo layout

```
parallaxie/
├── package.json                 # single VERSION source; scripts: build, test, package
├── src/
│   ├── core/                    # ES3 ExtendScript, concatenated in filename order → dist/pxe-core.jsx
│   │   ├── 00_head.jsx          #   IIFE open, constants, VERSION (stamped by build)
│   │   ├── 10_dom.jsx           #   AE-DOM adapter: comp resolution, layerById, matchName-only access, tags
│   │   ├── 20_rig.jsx           #   expressions, ensureRig, rigLayer/unrigLayer, migrate
│   │   ├── 30_depth.jsx         #   build (selection + naming doors), setDepth(s), distribute, randomize, FX linking
│   │   ├── 40_move.jsx          #   applyMove, clearMove, ease, lens
│   │   ├── 50_fog.jsx
│   │   ├── 60_geometry.jsx      #   pure functions over numbers: bands, coverage, maxSafeStrength (no AE DOM)
│   │   ├── 70_qa.jsx            #   preflight, audit, status
│   │   ├── 80_bake.jsx
│   │   ├── 90_api.jsx           #   PXE.call(jsonString) dispatcher, license hook, $.global.PXE, IIFE close
│   │   └── lib/json2_es3.jsx    #   minimal JSON for ES3 (no native JSON in ExtendScript)
│   ├── ui-scriptui/
│   │   └── Parallaxie.jsx       # panel; `//@include "../../dist/pxe-core.jsx"` for dev, inlined by build for dist
│   └── ui-cep/                  # Bolt-CEP project (TS + Vite); loads dist/pxe-core.jsx via $.evalFile at startup
│       ├── CSXS/manifest.xml
│       └── src/…
├── tests/
│   ├── PXE_SmokeTest.jsx        # runner; resolves siblings via $.fileName (see below)
│   ├── fixture.jsx              # $.global.PXE_FIXTURE.make(opts)
│   └── cases/                   # 0x_load … 1x_variants — each a function(check, PXE, fixture)
├── tools/
│   ├── build.py                 # concat + stamp VERSION + lint (display-name lookups, alert() in core) → dist/
│   ├── ae_run.py                # runs a .jsx in AE: backends = adb-mcp bridge | AfterFX.exe -r | osascript DoScriptFile
│   └── verify_frames.py
├── dist/                        # build output (gitignored): pxe-core.jsx, Parallaxie.jsx (ScriptUI, self-contained), *.zxp
├── _pxe_test/                   # suite output (gitignored except report.txt baseline)
└── docs/
```

**Keeping `$.fileName`-relative resolution working.** Two rules, one file: (1) the test runner
computes `here = File($.fileName).parent` once and loads *only* `here + "/fixture.jsx"`,
`here + "/cases/*.jsx"` and the core from `here + "/../dist/pxe-core.jsx"` with a fallback to
`here + "/../src/core"` concatenation via `//@include` when `dist/` is absent; (2) the
headless driver must `$.evalFile` the runner from its absolute path — never send the runner's
source as a string, because then `$.fileName` is empty. (`CLAUDE.md` documents this wrapper.)
The ScriptUI panel must **not** rely on `$.fileName` in dist — inline the core at build time,
because the ScriptUI Panels folder install copies one file. The CEP panel never uses
`$.fileName`; it uses `SystemPath.EXTENSION`.

`//@include` (ExtendScript preprocessor) resolves relative to the including file, which is
exactly right in dev and exactly what must not ship (the include is resolved at eval time on
the user's machine). Hence the concat step.

### 6.2 Core API changes that everything else depends on
- `PXE.call('{"cmd":"build","comp":<id>,"far":5000,"source":"selection"|"naming"}') →
  '{"ok":true,"msg":…,"warnings":[…],"data":{…}}'`. The existing functions stay as thin
  wrappers so the current suite keeps passing during migration.
- Every mutating command: explicit comp, `beginUndoGroup` first, `try/finally`, no mutation
  before `begin`.
- Rig identity by tag (`layer.comment` or a marker) + `layer.id`, never by display name.
- Base Scale captured alongside Base Position; expressions multiply `value`.
- `isRigged` = all controls present; `migrate` for partial/ZSC rigs.
- Camera position bound to zoom by expression; rig centre stored on the null.
- Preflight extended: locked, parented, keyed, matte, renderer, existing camera, duplicate
  names, comp/rig centre mismatch.

### 6.3 Work required before an aescripts submission
1. **Licensing hook.** aescripts supplies its framework (ExtendScript and CEP flavours) to
   accepted authors. Design the seam now: `PXE.license = { state(): "trial"|"licensed"|"expired", check(): … }`
   consulted by the dispatcher, with `PXE_LICENSE_PROVIDER` swappable so the suite runs with
   a stub that returns `licensed`. Never gate the core on a network call at load.
2. **Trial limitation.** Decide and implement one that *shows the moat*: full
   Build/Depth/Move/Preflight/Coverage on any comp; trial caps at 4 rigged planes and
   disables Bake and the future band-mask export. Do not watermark the render — this is a
   rig, not a template, and a watermark on the client's frame is how refunds happen.
3. **Localisation safety.** matchName-only ExtendScript; index-form expression lookups; the
   lint in `build.py`; one manual pass in a non-English AE install (Creative Cloud lets you
   install a second language) before every release. No emoji, no non-ASCII in labels.
4. **Install path.** Two artefacts from one build: `Parallaxie.jsx` (self-contained ScriptUI,
   installs via File → Scripts → Install ScriptUI Panel or the Manager App) and
   `com.parallaxie.panel.zxp` (signed CEP). Same version number, same core bytes.
5. **Compatibility matrix** stated on the page: AE 2022–2026, Win + macOS (Intel + Apple
   Silicon), Classic 3D and Advanced 3D (after the run in §3 #5 tells the truth), both
   expression engines. Run the suite on each AE beta and say so in the changelog — the
   competitive analysis found this single sentence is what buyers reward.
6. **Return-value and error discipline.** No `alert()`/`confirm()` in the core; the UI
   decides. Every failure names the layer and the fix.
7. **Documentation furniture.** 3–5 min overview video and a 10 min layered-art walkthrough
   on YouTube, linked from a Help button; a changelog with dates; a written page on the
   reveal-band maths (it is the product's thesis and currently lives in a README paragraph).
8. **Version single-sourcing** (`package.json` → stamped into core, panel, manifest, suite).
9. **Release gate script**: `build → lint → ae_run tests → verify_frames → package` — one
   command, exit code honest. There is no CI runner with AE in it; this script *is* the CI,
   run locally before every upload.
10. **Rename before shipping, not after**: the null (`PXE_CAM`), the control names
    (`P Base Position`), the button labels ("Audit Band"). Renames after release cost a
    migration path forever.

---

## Appendix A — one-line verifications to run before trusting this review
- Fractal Noise indices: dump `matchName + name` for the effect's properties (§3 #14).
- Depth sorting vs stack order in Classic 3D with three solids and a Screen card (§3 #15).
- `thisComp.activeCamera` with no camera layer: error, or default camera? (§3 #12b).
- The md5 lock under `comp.renderer = "ADBE Advanced 3d"` and with one plate at a fractional
  position (§3 #5, §4.2).

## Appendix B — the decoupling commit (2026-09-08) and the baseline still to capture

Everything below was done in commit `c4124db` without After Effects available, so **nothing
in it has been executed in AE**. No engine behaviour changed; all `Parallaxie_v1.jsx` edits
are inside comments.

### What changed
- **`PXE_Fixture.jsx`** (sibling of the suite, resolved via `$.fileName`) exposes
  `$.global.PXE_FIXTURE.make(opts) -> CompItem`, `.describe(comp)` and `.warnings[]`. Solids
  only, Gradient Ramp for texture, matchName access, no fonts, no `Math.random`. Comp
  `PXE_TEST`, 1920×1080, square pixels, 24 fps, 6 s — chosen over the old portrait size
  because the suite writes six full-frame PNGs per run and nothing depends on orientation.
- Stack (top = nearest): `03_NEAR` (cut-out, radial ramp; audit target; hidden in 8.2/8.3;
  skipped by `checkMove`), `05_FX_PortalGlow` (small additive solid; must inherit the gate's
  depth), `02_GATE_ALT` (hidden; the FX search must skip it), `02_GATE_PLATE` (full-frame
  with bleed, offset −24/+36 px so 1.8/1.9/2.2/6.4 test the lock on both axes),
  `01_SKY_ALT` (hidden), `01_SKY_PLATE` (exactly comp-size, zero bleed; the plate
  `checkMove` must flag).
- `make()` options: `width`, `height`, `fps`, `duration`, `name`, `renderer`, `splitter2D`
  (adds an enabled 2D `WATERMARK_2D` between planes; off by default). Running the file alone
  builds and opens the demo comp; `$.global.PXE_FIXTURE_HEADLESS = true` only defines the
  builder.
- `tools/ae_send.py`: bridge path via `PXE_ADB_MCP_PATH` (fallback `ADB_MCP_PATH`), `os.path`
  only, unset → exits with instructions; docstring reframes the bridge as optional.
- Header of `Parallaxie_v1.jsx` now reads v1.2 (not bumped; the suite still hard-codes
  `"1.2"`).
- `.gitattributes` added (LF everywhere, `*.psd *.psb *.png` binary); `.gitignore`
  generalized; `docs/EXTRACTION_NOTES.md` deleted; `_pxe_test/report.txt` renamed to
  `report_baseline_v1.2_legacy-fixture.txt`.

### Deviations from §4.4, and why
1. **No permanent 2D splitter** (`WATERMARK_2D` is opt-in). Test 8.9 already provisions its
   own spacer; a permanent one would change every Build's return string and put a second,
   never-verified variable (two Classic-3D render groups) under the md5 invariant on the very
   first run of a new fixture.
2. **Solids instead of a shape layer for the FX glow.** The md5 lock has only been proven on
   raster layers; a continuously rasterised vector layer scaled by `f` and projected back
   could differ by an LSB at the edge.
3. **Two hidden layers, not three, renamed `*_ALT`.** No assertion counts or names them.
4. **Gate off-centre** so the 1.8 identity is non-trivial on both axes.
5. **Sibling file, not `tests/fixture.jsx`.** The `tests/` move belongs to the §6.1 refactor.

### Predicted `report.txt` detail strings (expectations to confirm, not facts)
Same 49 PASS lines; these detail strings change because they echo fixture geometry:
- `0.2 synthetic fixture comp built  [1920x1080, 6 layers]`, preceded by a
  `fixture: 1920x1080 24fps 6.00s renderer=… stack: 03_NEAR > 05_FX_PortalGlow > 02_GATE_ALT(off) > 02_GATE_PLATE > 01_SKY_ALT(off) > 01_SKY_PLATE` line.
- `build: OK: rigged 4 layers (3 depth planes), far=5000, order=stack` +
  `WARN 2 NN_ layer(s) hidden and NOT rigged: 02_GATE_ALT, 01_SKY_ALT`.
- `1.8 … [world 913.5,609.8 expected 913.5,609.8]`; `1.9 … [193.75 vs 193.75]`;
  `2.2 … [world 922.5 expected 922.5]`.
- `3.3 … [dz=246.0]`; `3.4 … [1.0500 vs 1.0332]`.
- `6.1 bake … baked 5 layers`; `7.2 reset … 5 layers`.
- `8.3 … [WARN 3 NN_ layer(s) hidden and NOT rigged: 03_NEAR, 02_GATE_ALT, 01_SKY_ALT]`.
- `8.5 … [PXE_FOG_02 at index 8 of 10]`; `8.1 … [comp: PXE_TEST 1920x1080  24fps  6.00s]`.
- `9.1 … [bands: Drift L 5%   comp 1920x1080   zoom 2667]`; `9.2` titled "exact lateral form
  collapses onto the common shorthand at z_near=0" with `[shorthand 46.5 vs exact 46.5]`;
  `9.3 … [… r_corner = 1101, dolly = 246]`.
- `9.5 … [  EXPOSES  01_SKY_PLATE (z3333): 85 px of empty canvas]`.
- **`9.6 … [  first failure at 0.0% (01_SKY_PLATE)]`** — the legacy baseline says `10.0%`,
  but the current `checkMove` computes the first-failure margin from the plate's flat bleed
  (`margin = -R.left`), which is exactly 0 for a zero-bleed plate; the 10.0% can only come
  from an older formula. So the legacy baseline predates the current `checkMove` and cannot
  serve as the diff reference. The assertion (`"first failure at"` present, no `"at -"`)
  passes either way. If the new run prints anything other than `0.0%`, the code and this
  reading disagree — look.

### Not verified (no AE in the environment)
- That AE renders frame 0 byte-identical with this fixture (Gradient Ramp on solids, gate
  offset −24/+36, `f = 1.9375`). Same geometry the old fixture passed on; not executed.
- The Gradient Ramp parameter matchNames (`ADBE Ramp-0001…-0005`). A miss is logged as
  `WARN  fixture: …` in report.txt rather than hidden; the tests do not depend on the ramp
  values (the near cut-out alone guarantees `f_push_end != f_flat`).
- `comp.renderer` readability on the owner's AE version (guarded; prints `renderer=?` if not).
- The `Item.selected` deselect/select loop in `make()` (guarded; a failure is a fixture WARN).
- Both `.jsx` files parse clean at ECMAScript 3 and 5; `ae_send.py` was exercised with a stub
  `socket_client` (unset → message, repo root → finds `mcp/`, bad path → message).

### Follow-ups noticed, deliberately not done in that commit
- Button label "Audit Band" — a UI change, left for the panel phase.
- `PROXY_URL` in `ae_send.py` is still a constant; an env var is a two-line addition.
