# Parallaxie CEP Panel -- UX Specification

*2026-09-08. Design contract for the CEP panel (Phase 3 build, per the UI decision in
`Parallaxie_Brief.md` sec. 7). The scaffold and component agents build against this
document. Where this spec and the engine disagree, the engine (`Parallaxie_v1.jsx`) is
the fact; update this spec, do not invent engine behaviour in the panel.*

**Engine version assumed:** core v1.2 API as shipped in `Parallaxie_v1.jsx`, plus the
Phase 1 `PXE.call(json)` dispatcher (structured results). Everything marked
**[planned: ...]** does not exist in the engine today and must not appear as a live,
enabled control in a build that runs against an engine without it. Rendering a planned
control in a visibly disabled "coming" state is forbidden -- planned features are
absent, not teased. The spec defines them so the layout reserves room and the names
are decided once.

**Hard rules inherited from `CLAUDE.md` (violating these fails review):**

- No `alert()` / `confirm()` anywhere. Confirmation is inline (see 9.4).
- ASCII only in every label, tooltip, string and generated document. No emoji.
- Full multi-line results, always. First-line-only display is defect #9 and the
  single named failure of the old panel. There is no context in which the panel
  truncates an engine result.
- Never hand-compute reveal bands or coverage. The panel displays `PXE.checkMove` /
  `PXE.bands` output; it performs no band math of its own, ever, including for
  drawing the band segments in the depth graph.
- One undo group per user gesture. Nothing mutates outside a group.
- No platform-specific paths; panel assets resolve via `SystemPath.EXTENSION`.
- The panel never renames, moves or restructures core files.

---

## 1. Purpose and scope

The panel is a skin over `$.global.PXE`. It adds zero scene logic: every mutation and
every computation happens in the core via `evalScript`. The panel owns presentation,
gesture handling, throttling, optimistic state, and honest display of everything the
core reports.

Two jobs, in order of importance:

1. **Make the moat visible.** Coverage (`checkMove` / `bands`) is the one capability
   no competitor has and it is currently API-only. The depth graph and the coverage
   view exist to put it on screen.
2. **Make the three-click workflow (Build / Depth / Move) fast and honest**, with
   preflight, warnings and utilities always one click away and never truncated.

Out of scope for this spec: packaging/signing, licensing UI, batch UI, band-mask
export UI (all later phases), and the ScriptUI Lite panel.

---

## 2. Information architecture

A single scrolling column in workflow order, one screen, no tabs. Tabs hide the
coverage story; a column tells it: build, place depth, choose a move, see what tears.

```
+--------------------------------------------------+
|  HEADER   comp name . rig state . [Preflight]    |   fixed
+--------------------------------------------------+
|  1 BUILD     preset . far . [Build from Comp]    |
+--------------------------------------------------+
|  2 DEPTH     depth graph (the centerpiece)       |   takes all spare
|              [Distribute] [Randomize] fields     |   vertical space
+--------------------------------------------------+
|  3 MOVE      move . strength . duration          |
|              [Apply Move] [Clear Move]           |
+--------------------------------------------------+
|  COVERAGE    per-plane table for current         |
|              move+strength . [Max Safe]          |
+--------------------------------------------------+
|  EXTRAS      Fog (collapsed by default)          |
+--------------------------------------------------+
|  UTILITIES   Audit . Bake . Reset . Status       |
+--------------------------------------------------+
|  RESULTS     multi-line console (collapsible,    |   fixed, min 3 lines
|              never truncating)                   |
+--------------------------------------------------+
```

Layout decisions, stated once:

- **Minimum panel size 360 x 640 px; designed range 360-560 wide.** All sections are
  single-column at any width; nothing reflows into side-by-side panes.
- **The depth graph is the flexible element.** It grows with panel height (one lane
  per plane, lanes never shrink below their minimum -- beyond that the graph region
  scrolls vertically inside itself). Every other section is intrinsic height.
- **Coverage sits directly under Move**, because coverage is a function of
  (move, strength); the table re-evaluates when either commits. Coverage status also
  echoes into the depth graph as per-lane indicators, so the story is readable from
  the graph alone in a screenshot.
- **Fog is collapsed by default and stays collapsed across sessions unless the user
  opened it.** It is a look feature, never part of the headline flow (brief sec. 5).
- **The results console is docked, not floating**, and is the only place engine text
  appears. Section-level actions do not have their own toast/snackbar systems.
- Section headers "1 Build", "2 Depth", "3 Move" carry the numbers: the three-click
  workflow is the product's spine and the panel says so.

Empty states: with no active comp, sections 1-3 render with controls disabled and the
header reads `No active comp`. With a comp but no rig, the depth graph region shows
`Nothing rigged - run Preflight, then Build` and Coverage shows `Requires a rig`.

---

## 3. Header and Preflight

| Element | Behaviour | Engine call |
|---|---|---|
| Comp name + size | From the last scene refresh (see 10.6). Click re-refreshes. | `PXE.status()` (interim) / `PXE.call {"fn":"status"}` |
| Rig state chip | `FLAT` (no rig), `RIGGED n planes`, `MOVE: <type> <pct>%` when move keys exist | derived from status data |
| `Preflight` button | Always enabled when a comp is active. Primary visual weight in the header -- the working agreement says run it first, every time, so it is the most reachable action in the panel. | `PXE.preflight()` |

Preflight results render in the results console per section 8. A preflight that
returns any `BLOCKER` line also paints the header chip red until the next preflight
returns clean; `WARN` paints it amber. The panel never blocks Build on a preflight
result -- the engine decides what is an error; the panel informs.

---

## 4. Section 1 -- Build

| Control | Spec | Engine call |
|---|---|---|
| Scene preset dropdown | `Room` (1500), `Exterior` (5000, default), `Epic Vista` (8000), `Custom`. Selecting a preset fills the Far field; editing Far flips the dropdown to `Custom`. | none (fills the field) |
| Far field | Numeric, integer, min 100. This is the depth-axis extent for the graph too. | argument to build / distribute |
| Depth order (advanced, behind a disclosure) | `Stack (top = nearest)` default, `Name ascending (01 = farthest)`, `Name descending (01 = nearest)`. Default is stack and the disclosure stays closed unless opened; stacking order is the product principle. | `order` option |
| `Build from Comp` button | Full-width, the section's single primary action. On success, refresh scene and depth graph. On any result, print the full multi-line return -- Build's WARN lines (hidden layers, 2D splitters, numbering direction) are exactly the lines defect #9 lost. | `PXE.buildFromComp(far, {order: "stack"\|"name-asc"\|"name-desc"})` |
| Build from Selection | **[planned: Phase 2 roadmap item -- selection-based build]**. When it ships it becomes the default door and `Build from Comp` becomes the pipeline door. Reserve the section layout for two buttons. | (future dispatcher cmd) |

Do not expose `allowHidden`: it only suppresses the hidden-layer warning (S2 item,
"allowHidden misleading") and the panel's job is to show warnings, not offer a
checkbox that hides them.

Re-running Build resets depths today (debt #8). Until idempotent Build ships in
Phase 1, the Build button on an already-rigged comp uses the inline confirm pattern
(9.4) with the label `Rebuild resets all depths. Confirm?`.

---

## 5. Section 2 -- Depth graph (the defining screen)

### 5.1 Anatomy

A horizontal Z axis, camera at the left, planes as horizontal bars, one lane per
rigged plane, lanes ordered by stacking order top-to-bottom (top of stack = nearest =
top lane -- the graph reads like the layer stack).

```
 cam                    Z axis  0 ....................... far
  |
[<]  01_FG_BRANCH   |==H                          |  z 0      . cutout
[<]  02_HERO        |=====H                       |  z 600    . cutout
[<]  03_TREES       |==========H                  |  z 1400   . cutout
[<]  04_HILLS       |================H            |  z 2400   o clear
[<]  05_MOUNTAINS   |=====================H       |  z 3600   o clear
[<]  06_SKY_PLATE   |=========================H   |  z 5000   x EXPOSES 38px
```

Per lane, left to right:

1. **Audit toggle** `[<]` (16 px, icon-only, tooltip `Audit this plane`): solos the
   plane at the move extreme. Exactly one lane can be active; activating another
   lane, or toggling off, restores. Calls `PXE.auditOn(name)` / `PXE.auditOff()`.
2. **Plane name**, ellipsized in the middle beyond 14 characters, full name in
   tooltip. Fog cards appear as lanes too (they are rigged layers), marked with a
   `fog` suffix tag and drawn at 60% text opacity.
3. **Track**: the z range `[0, far]` mapped linearly to pixels. Axis gridlines at
   0, 25, 50, 75, 100% of far, labelled `0` and `far` only (integers).
4. **Bar and handle**: the bar fills from 0 to the plane's z; the handle `H` is the
   grab point at z. The bar is reading aid, the handle is the control.
5. **Band segment**: when a move+strength is set and the current coverage result is
   loaded, each adjacent-plane cut's reveal width (from `PXE.bands` data, never
   computed in the panel) renders as a thin marker on the far side of the nearer
   plane's handle, scaled to the axis. Purely informational, no interaction.
6. **Coverage indicator + readout**: `o` clear (green), `x` exposes (red, with
   `EXPOSES <n>px`), `.` cutout (neutral gray, tooltip `Cut-out plane - not a
   full-frame plate; skipped by coverage`). From the last coverage evaluation;
   grays out (stale state, 50% opacity) the moment any depth, move or strength
   changes, until the next evaluation lands.
7. **Numeric z field**: always visible, right-aligned, integer, width for 5 digits.

The camera is drawn as a fixed glyph in the left gutter spanning all lanes, with the
label `cam`. It is not interactive in v1 (camera zoom/position coupling is a Phase 1
engine item, not a panel control).

Hidden `NN_` layers reported by preflight/build are not lanes (they are not rigged),
but the graph header shows a persistent notice chip `n hidden planes not rigged`
whenever the last build/preflight reported them; clicking it reprints that result in
the console. Reported, never silently absent from the story.

### 5.2 Lane metrics and hit targets

- Lane height 28 px minimum, 32 px preferred. Handle: 10 px wide, full lane height
  minus 4 px, with an invisible hit slop of 6 px each side (22 px effective target).
- The entire track row (not just the handle) accepts drag: pointer-down anywhere on
  the track jumps nothing -- it grabs the handle only if within slop; otherwise it is
  a click that selects the lane. **No click-to-jump on the track.** Accidental
  depth pops are worse than one extra drag.
- Vertical drag tolerance: once a drag starts, pointer may leave the lane vertically
  without losing the drag (pointer capture).

### 5.3 Interaction states

| State | Visual |
|---|---|
| Default | bar at 70% opacity, handle neutral |
| Hover (handle) | handle brightens, cursor `ew-resize`, z tooltip |
| Selected lane | 1 px accent outline on the lane, name at full opacity; receives keyboard |
| Dragging | handle accent-filled; live z readout in the numeric field; coverage indicators for all lanes go stale-gray |
| Committing (release sent, awaiting result) | handle keeps accent, thin progress underline on the lane |
| Reconciled-error (engine rejected or drifted) | handle snaps to engine value with a 150 ms transition; lane flashes amber once; error text in console |
| Coverage failing | red indicator plus `EXPOSES n px` readout; the lane's bar gets a 1 px red top edge so failing planes are findable in a screenshot |

### 5.4 Drag-to-set-depth: live vs on-release

- **Optimistic and live:** handle position, bar length, numeric field update every
  animation frame from the pointer, unthrottled.
- **Engine, throttled:** depth writes go through the bridge drag channel (10.3) at
  10-15 Hz so AE's viewer tracks the drag. One undo group covers the whole drag.
- **On release only:** coverage re-evaluation (`checkMove` + `bands`), scene
  refresh/reconciliation, undo group close. Never call `checkMove` mid-drag.
- Values clamp to `[0, far]` during drag. Numeric entry may exceed `far`; if it
  does, the axis extent grows to the new maximum for display (the engine does not
  clamp `setDepth` and the graph must not lie about where a plane is).

Engine calls: drag updates and numeric commits are `PXE.setDepth(name, z)` semantics,
carried over the drag protocol in 10.3 (interim: raw `PXE.setDepth`; target: the
dispatcher's depth command with an undo phase flag). Multi-lane operations
(future multi-select) would use `PXE.setDepths(map)`; v1 is single-lane only.

### 5.5 Keyboard

Keyboard operates on the selected lane. The graph is a focusable region; CEP panels
must explicitly manage keyboard focus -- clicking a lane focuses the graph, `Escape`
releases focus back to the host app.

| Key | Action |
|---|---|
| Up / Down | select previous / next lane |
| Left / Right | nudge z by `far / 500` rounded to an integer, min 1 (10 units at far 5000) |
| Shift + Left / Right | nudge by 10x the base step |
| Alt + Left / Right | nudge by 1 |
| Enter | focus the lane's numeric field (select-all) |
| Escape (in numeric field) | revert field, return focus to the graph |

Each nudge keypress is a discrete gesture: one `setDepth`, one undo group per
press-and-release; holding a key auto-repeats inside a single group opened on
keydown and closed on keyup (same protocol as a pointer drag).

### 5.6 Numeric entry fallback

The per-lane field commits on Enter or blur: parse as float, round to integer,
reject NaN (revert, no engine call). A commit is one `PXE.setDepth(name, z)` in its
own undo group, then coverage re-evaluation. The field is the accessibility
fallback: everything the drag can do, the field can do.

### 5.7 Depth section actions

Below the graph, one row:

| Control | Spec | Engine call |
|---|---|---|
| `Distribute` | Fields: near (default 0), far (defaults to Build far), bias (default 1.0, step 0.1, tooltip `Above 1 clusters planes toward the camera`). One click, one undo group. Refresh graph + coverage after. | `PXE.distribute(near, far, bias)` |
| `Randomize` | Field: band (default 200). | `PXE.randomize(band)` |

---

## 6. Section 3 -- Move

| Control | Spec | Engine call |
|---|---|---|
| Move selector | Six options, exact strings: `Push-In`, `Pull-Back`, `Drift L`, `Drift R`, `Rise`, `Sink`. Segmented control (2 rows x 3) rather than a dropdown -- all six visible is part of the product story. Default `Push-In`. | argument |
| Strength | Numeric, percent, default 5, range 0.1-50, one decimal. Label `Strength %` with tooltip `Normalised: apparent scale change of the mid-depth plane (push/pull) or fraction of comp size (drift/rise/sink)`. Changing it marks coverage stale and schedules re-evaluation on commit (10.4). | argument |
| Duration | Numeric, seconds, default = comp duration, one decimal. | argument |
| `Apply Move` | Primary action. Replaces any existing move (engine behaviour; the label's tooltip says so: `One move per shot - applying replaces the previous move`). Full result to console. | `PXE.applyMove(type, durationSec, strengthPct)` |
| `Clear Move` | Secondary. | `PXE.clearMove()` |
| Ease control | **[planned: Phase 2 roadmap item -- global ease control]**. The engine currently applies its fixed ease to the two keys; there is no parameter. When it ships: a single ease amount control applying to both keys. | (future dispatcher cmd) |
| Start time | **[planned: Phase 2 roadmap item -- start-time choice]**. Engine keys always land at t=0 today (S2 list). When it ships: three-way choice `t=0` / `CTI` / `Work area start`, default `t=0`. | (future dispatcher cmd) |

Changing move or strength does not touch the comp; only `Apply Move` mutates.
Coverage, however, evaluates for the *candidate* move+strength (checkMove takes them
as arguments and mutates nothing) -- this is the point: you see the tear before you
animate.

---

## 7. Coverage view

Coverage answers, for the currently selected move and strength: which full-frame
plates run out of paint, by how much, and how hard you can push. All data comes from
`PXE.checkMove(type, pct)` and `PXE.bands(type, pct)`; the panel adds no math -- not
even unit conversion beyond formatting.

### 7.1 Evaluation triggers

Re-evaluate (both calls, back to back through the bridge) when: a depth drag ends, a
numeric depth commits, Distribute/Randomize completes, Build completes, move or
strength commits, or the user clicks the refresh icon in the section header. Never
during a drag. While a result is pending or inputs changed since the last result,
the whole section renders in the stale state (50% opacity, `evaluating...` /
`stale - changes pending` caption).

### 7.2 Display

Header line: `Coverage: <move> <strength>% . <n> plates checked . <k> cut-outs skipped`.

Per-plane table, one row per rigged plane, same order as the depth graph:

| Column | Content |
|---|---|
| Status | `CLEAR` (green), `EXPOSES` (red), `CUT-OUT` (neutral, row at 60% opacity) |
| Plane | name |
| Detail | for EXPOSES: `<n> px of empty canvas` (integer px from checkMove); for CUT-OUT: `not a full-frame plate - skipped`; for CLEAR: em-dash equivalent `-` |

Footer lines, verbatim from the engine data:

- Lateral moves: `First failure at <pct>% (<plane name>)` when checkMove reports one.
- `Push-In`: the engine's note that push-in cannot fail (margins grow); render as an
  informational line, not a green ALL CLEAR.
- Radial moves: the engine's centre-facing-edges note from `bands` renders as an
  informational line when present.
- Per-cut band widths from `bands` are available behind a `Show bands` disclosure:
  one line per adjacent cut, `<near> (z<zn>) -> <far> (z<zf>): <n> px`, plus the
  near-to-far total line. These same widths drive the depth-graph band segments.

### 7.3 Actions

| Control | Spec | Engine call |
|---|---|---|
| `Set Max Safe` | Enabled only when the current coverage result contains a first-failure strength (lateral moves today). Sets the Move section's strength field to the first-failure value minus a 0.5 percentage-point margin (floored at 0.1), then re-evaluates. The button caption shows the target: `Set Max Safe (7.3%)`. Does not apply the move. | reads `checkMove` data; sets a field |
| Max safe for `Pull-Back` | **[planned: Phase 1 roadmap item -- Pull-Back first-failure solve / closed-form max-safe for all six moves]**. Until the engine reports it, the button is absent for Pull-Back and the footer says the engine does not yet report a Pull-Back failure strength. | (future engine data) |
| `Show Band Overlay` | **[planned: Phase 2 roadmap item -- on-canvas band overlay, a guide shape layer created by the core]**. Absent until the engine command exists. | (future dispatcher cmd) |

### 7.4 Dispatcher data contract (required from Phase 1)

The string returns of `checkMove` cannot drive a table (cut-outs are counted, not
named). The panel requires the dispatcher's coverage command to return, in `data`:
per-plane records `{name, z, status: "clear"|"exposes"|"cutout", px}` (px integer,
present when status is `exposes`), plus `{firstFailurePct, firstFailurePlane}` when
applicable, and for bands: `{cuts: [{nearName, farName, zNear, zFar, bandPx}],
totalPx, totalPctOfWidth, note}`. This is display plumbing for math the engine
already does (`checkMove` computes coversFlat and per-plane gaps internally); it is
not new math. Until the dispatcher ships, the panel runs on mocks (section 11) --
it does not parse the v1.2 strings into a table.

---

## 8. Preflight and results console

The console is the single output surface. Requirements:

- **Full text, always.** Every line of `{ok, msg, warnings, data}` (and, interim,
  every line of a raw string return) renders. Scrollable, min-height 3 lines,
  user-draggable divider up to 40% of panel height, collapsible to a 1-line summary
  strip -- but expanding always reveals the complete text; nothing is dropped.
- **Structure:** each engine action appends an entry: timestamp (HH:MM:SS), the
  command name, then the message body monospace. Entries are separated by a hairline.
  Keep the last 50 entries.
- **Line classification by prefix**, matching the engine's vocabulary exactly:
  `BLOCKER` red, `WARN` amber, `ERROR` red, `NOTE` and `INFO` neutral-dim, `OK` and
  `CLEAR` green tint on the prefix token only. Warning lines additionally get an
  amber left border so they are scannable in a wall of text; blockers a red one.
  With structured results, everything in `warnings[]` gets the amber treatment even
  without a prefix.
- **Failures name the layer and the fix.** That is the engine's contract (CLAUDE.md);
  the panel's obligation is not to break it: no rewriting, summarising or
  "friendlifying" of engine text. The panel may append, never replace.
- A `Copy` action per entry puts the raw text on the clipboard (studio ticket flow).
- `ok: false` results also pulse the console open if it was collapsed.

Preflight output is just another entry, but the header chip mirrors its worst line
class (section 3).

---

## 9. Extras and utilities

### 9.1 Fog (collapsed section, header `Fog cards (optional)`)

| Control | Spec | Engine call |
|---|---|---|
| `Add Fog Card` | Fields: z (blank = engine default of half mean plane depth; placeholder `auto`), opacity % (default 12), colour swatch (default the engine default; passed as `[r,g,b]` floats 0-1). | `PXE.addFogCard(z, opacityPct, [r,g,b])` (omit args left at default) |
| `Restack Fog` | One click. | `PXE.restackFog()` |

Fog cards appear as lanes in the depth graph (5.1). Fog is never auto-added and the
section never auto-expands.

### 9.2 Utilities row

| Control | Spec | Engine call |
|---|---|---|
| `Audit Off` | Global escape hatch, enabled whenever an audit is active (per-lane toggles are the entry point, 5.1). | `PXE.auditOff()` |
| `Bake` | Inline confirm (9.4): `Bake strips the rig, keeping the result. Confirm?` | `PXE.bake()` |
| `Reset` | Inline confirm: `Reset returns layers to flat 2D. Confirm?` | `PXE.reset()` |
| `Status` | Prints the status report to the console and refreshes the scene model. | `PXE.status()` |
| Flat / Rigged proof toggle | **[planned: Phase 2 roadmap item -- the frame-0 lock as something a buyer can see live]**. Requires a non-destructive engine command to suspend and restore the rig; no such command exists in v1.2 and the panel must not fake it with Bake/Reset (both are destructive). Absent until the engine ships it. | (future dispatcher cmd) |

Bake and Reset warn additionally when the scene model shows pre-existing keyframes
were reported by preflight (debt #3: they throw mid-loop today); the warning is
informational text in the confirm strip, not a block.

### 9.3 Why audit lives on the lanes

Audit is per-plane by nature (`auditOn(name)`); a bare toolbar button acting on "the
selection" reproduces the old panel's dependence on AE's selection state. The lane
toggle makes the target explicit. `Audit Off` in utilities is the always-visible way
back, since audit changes solo states and comp time.

### 9.4 Inline confirm pattern (replaces confirm())

A destructive button, on first click, transforms in place into a confirm strip:
`<message> [Confirm] [Cancel]`, auto-cancelling after 6 seconds or on any other
interaction. No modal, no dialog, no second window. This pattern is the only
confirmation mechanism in the panel.

---

## 10. The evalScript bridge -- behaviour the UI assumes

All engine access goes through one bridge module. Components never call
`csInterface.evalScript` directly and never parse engine strings themselves.

### 10.1 Call shape

- Target: `PXE.call(jsonString) -> jsonString` with `{ok, msg, warnings, data}`
  (Phase 1 dispatcher, review sec. 6.2). The bridge exposes
  `call(cmd, params): Promise<PXEResult>` and serialises with `JSON.stringify` --
  never string concatenation of user input into script text.
- Interim (engine without dispatcher): the bridge wraps the v1.2 string functions
  and normalises to `PXEResult` as `{ok: !/^ERROR/.test(s), msg: s, warnings: [],
  data: null}`. Components see one shape either way. Table-driving data (coverage
  per-plane records) is mock-only until the dispatcher ships; the coverage table is
  therefore dispatcher-gated, while the console works against both.
- Every result, success or failure, is appended to the console by the bridge layer
  (single choke point guarantees defect #9 cannot recur in a component).

### 10.2 Serialisation and latency

`evalScript` is async and serialised on AE's main thread (~1-5 ms plus whatever the
command does, plus a viewer redraw for mutations). The bridge enforces:

- **Single flight per channel.** Two channels: `interactive` (drag traffic) and
  `command` (everything else). Within a channel, one call in flight; queued calls
  run FIFO. Drag updates coalesce: while one is in flight, only the newest pending
  value is kept (latest-wins), older intermediates are dropped.
- Command timeout 10 s: the promise rejects, the console gets
  `ERROR: panel timeout waiting for <cmd> - After Effects may be busy`, and the
  scene model is marked stale for reconciliation. No automatic retry of mutations.

### 10.3 Drag protocol: 10-15 Hz, one undo group, watchdog

- Drag engine updates are throttled to **10-15 Hz** (trailing-edge throttle,
  interval 66-100 ms; default 80 ms) regardless of pointer event rate.
- **One undo group per drag.** The bridge opens the group on gesture start and
  closes it on gesture end. Target dispatcher contract: the depth command carries a
  phase -- `{"cmd":"depth.set","layer":<name>,"z":<n>,"phase":"begin"|"drag"|"commit"}`;
  the engine opens its undo group on `begin`, applies on `drag`, applies and closes
  on `commit`. (Interim fallback without the dispatcher: dedicated
  `PXE_UI.beginDrag()` / `PXE_UI.endDrag()` helpers around raw `setDepth`; what must
  hold either way is: group opened before the first mutation, closed exactly once,
  `try/finally` on the engine side -- debt #7's rule.)
- **Watchdog lives in the panel** (ExtendScript has no reliable timer): if a drag is
  open and no pointer event has arrived for **2000 ms**, or the window loses focus,
  or `pointercancel` fires, the bridge sends `commit` with the last value, closes
  the gesture, and reconciles. A lost mouseup must never leave AE swallowing every
  subsequent action into one "PXE Depth" undo group.
- Keyboard nudge auto-repeat uses the identical protocol (5.5).

### 10.4 Optimistic UI and reconciliation

- The panel's scene model updates optimistically on every gesture; the depth graph
  never waits for AE to move a handle.
- On `commit` (or any mutation) resolution: if `ok`, the bridge issues a scene
  refresh (10.6) and reconciles model to engine truth -- engine values win silently
  when within rounding (1 unit), win with the reconciled-error visual (5.3) when
  larger or when `ok: false`.
- On timeout or evalScript failure: model marked stale, forced refresh, console
  entry. The panel never retries a mutation on its own.

### 10.5 Comp identity

`app.project.activeItem` is unstable (S2 #19). The scene model records the comp id
and name at refresh; before any mutation the bridge compares the current active comp
id (cheap query bundled into the drag `begin` / command preamble) and refuses with
`ERROR: active comp changed - refresh` rather than mutating a different comp.
**[planned: Phase 1 roadmap item -- explicit comp on every API call; when the
dispatcher accepts `comp: <id>`, the bridge passes it on every command and this
guard becomes engine-side.]**

### 10.6 Scene refresh

One command returns the scene model: comp id/name/size/fps/duration, rig presence,
move key count, and per-plane `{name, z, scalePct, stackIndex}`. Interim source:
`PXE.status()` parsed by the bridge (its line format is stable and machine-readable:
`name z=N scale=N`). Target: dispatcher `{"fn":"status"}` returning the same in
`data`. Refresh triggers: panel focus, header click, after every mutation, after
timeout recovery. There is no polling loop.

---

## 11. Mock data for browser-only development

The bridge has a mock implementation selected automatically when `window.__adobe_cep__`
is absent, so every component runs in a plain browser with realistic data. Mocks
live in one module and implement the same `call(cmd, params)` interface, including
80-200 ms artificial latency and the drag protocol.

TypeScript shapes (the panel-side contract; also the target for the dispatcher's
`data` payloads):

```ts
interface PXEResult<T = unknown> {
  ok: boolean;
  msg: string;          // full multi-line text, engine vocabulary intact
  warnings: string[];   // rendered amber, in full
  data: T | null;
}

interface ScenePlane {
  name: string;
  z: number;            // depth units
  scalePct: number;     // current rendered scale, e.g. 128.4
  stackIndex: number;   // 1 = top of stack = nearest
  isFog: boolean;
}

interface SceneModel {
  compId: number;
  compName: string;
  width: number; height: number; fps: number; durationSec: number;
  far: number;
  rigged: boolean;
  moveKeys: number;     // 0 or 2
  planes: ScenePlane[];
}

type CoverageStatus = "clear" | "exposes" | "cutout";

interface CoveragePlane {
  name: string;
  z: number;
  status: CoverageStatus;
  px?: number;          // present when status === "exposes"
}

interface CoverageReport {
  move: string;         // "Push-In" | "Pull-Back" | "Drift L" | "Drift R" | "Rise" | "Sink"
  strengthPct: number;
  planes: CoveragePlane[];
  cutoutsSkipped: number;
  firstFailurePct?: number;    // lateral moves only in v1.2
  firstFailurePlane?: string;
  notes: string[];      // engine informational lines, verbatim
}

interface BandCut {
  nearName: string; farName: string;
  zNear: number; zFar: number;
  bandPx: number;
}

interface BandsReport {
  move: string; strengthPct: number;
  cuts: BandCut[];
  totalPx: number;
  totalPctOfWidth: number;
  notes: string[];
}
```

The default mock scene -- six planes, one failing coverage plane, exercising every
lane state (a cut-out, a fog card, a clear plate, a failing zero-bleed plate):

```ts
const MOCK_SCENE: SceneModel = {
  compId: 101, compName: "HERO_SHOT_v3", width: 1920, height: 1080,
  fps: 24, durationSec: 6, far: 5000, rigged: true, moveKeys: 2,
  planes: [
    { name: "01_FG_BRANCH",  z: 0,    scalePct: 100.0, stackIndex: 1, isFog: false },
    { name: "02_HERO",       z: 600,  scalePct: 118.2, stackIndex: 2, isFog: false },
    { name: "03_TREES",      z: 1400, scalePct: 142.5, stackIndex: 3, isFog: false },
    { name: "PXE_FOG_01",    z: 2000, scalePct: 160.7, stackIndex: 4, isFog: true  },
    { name: "04_HILLS",      z: 2400, scalePct: 172.9, stackIndex: 5, isFog: false },
    { name: "05_MOUNTAINS",  z: 3600, scalePct: 209.3, stackIndex: 6, isFog: false },
    { name: "06_SKY_PLATE",  z: 5000, scalePct: 251.8, stackIndex: 7, isFog: false },
  ],
};

// Coverage for Drift L 5% on the mock scene: sky plate has zero bleed and tears.
const MOCK_COVERAGE: CoverageReport = {
  move: "Drift L", strengthPct: 5,
  planes: [
    { name: "01_FG_BRANCH", z: 0,    status: "cutout" },
    { name: "02_HERO",      z: 600,  status: "cutout" },
    { name: "03_TREES",     z: 1400, status: "cutout" },
    { name: "PXE_FOG_01",   z: 2000, status: "clear"  },
    { name: "04_HILLS",     z: 2400, status: "clear"  },
    { name: "05_MOUNTAINS", z: 3600, status: "clear"  },
    { name: "06_SKY_PLATE", z: 5000, status: "exposes", px: 38 },
  ],
  cutoutsSkipped: 3,
  firstFailurePct: 3.6,
  firstFailurePlane: "06_SKY_PLATE",
  notes: [],
};
```

Mock preflight returns one of three canned results selectable in a dev-only switch:
clean; warnings (front-to-back numbering WARN plus a 2D-splitter WARN); blocked
(hidden-layer BLOCKER naming two layers). Mock band data must be self-consistent
with MOCK_SCENE's cuts (7 planes = 6 cuts). Mock mutation commands mutate the mock
scene so optimistic reconciliation paths run in the browser too, and the mock can
inject a forced reconciliation error and a forced timeout (dev switches) so 5.3's
error states and 10.3's watchdog are testable without AE.

---

## 12. Visual language

Professional and restrained: a precision rig tool docked beside AE's own panels,
not a template pack. If a style choice would look at home on a Videohive thumbnail,
it is wrong here.

- **Dark theme matching AE.** Base surfaces in AE's range: background `#232323`,
  section surface `#2a2a2a`, hairlines `#3a3a3a`, primary text `#d6d6d6`, secondary
  `#9a9a9a`. On CEP load, read the host skin via
  `CSInterface.getHostEnvironment().appSkinInfo` and map the background to the
  host's panel colour so the panel sits flush at any AE brightness setting; the
  rest of the ramp derives from it. No light theme in v1.
- **One accent**: desaturated blue `#5a9bd4` -- selection, drag state, primary
  buttons. Status colours, used only for status: green `#6aa84f`, amber `#e0a030`,
  red `#d45a5a`. Nothing else is coloured. No gradients, no glows, no shadows
  beyond a 1 px hairline treatment.
- **Type:** system UI stack (`-apple-system, "Segoe UI", sans-serif`); 12 px base,
  11 px secondary, 12 px monospace (`Consolas, Menlo, monospace`) for the console,
  numeric fields and all z/px readouts. Tabular numerals where available. No
  webfonts.
- **ASCII only** in every label, tooltip, console string and this spec's named
  captions. Status glyphs are drawn (SVG/CSS), never emoji or Unicode symbols.
- **Density:** 8 px spacing grid; controls 24 px tall (28 px primary buttons);
  section padding 12 px. The panel is a tool used hourly -- compact beats airy.
- **Iconography:** minimal line icons (audit, refresh, copy, disclosure) drawn as
  inline SVG at 1.5 px stroke, `currentColor`. No icon font, no external assets.
- Buttons are labelled with verbs already used in this spec; casing is
  `Sentence case` for buttons, `UPPERCASE` reserved for the engine's own status
  vocabulary (BLOCKER, WARN, EXPOSES, CLEAR) rendered verbatim.

---

## 13. Control-to-API reference

Every control, its engine call, its arguments. Anything marked planned has no engine
call today and is absent from a v1.2-engine build.

| Control | Engine call | Notes |
|---|---|---|
| Preflight | `PXE.preflight()` | header, always available |
| Build from Comp | `PXE.buildFromComp(far, {order})` | order from advanced disclosure |
| Build from Selection | -- | [planned: Phase 2 selection-based build] |
| Depth drag / nudge / numeric | `PXE.setDepth(name, z)` via drag protocol (10.3) | one undo group per gesture |
| Distribute | `PXE.distribute(near, far, bias)` | |
| Randomize | `PXE.randomize(band)` | |
| Apply Move | `PXE.applyMove(type, durationSec, strengthPct)` | six exact move strings |
| Clear Move | `PXE.clearMove()` | |
| Ease control | -- | [planned: Phase 2 global ease] |
| Start time (t=0 / CTI / work area) | -- | [planned: Phase 2 start-time choice; engine keys at t=0 today] |
| Coverage evaluation | `PXE.checkMove(type, pct)` + `PXE.bands(type, pct)` | read-only; candidate move/strength |
| Set Max Safe | reads `firstFailurePct` from checkMove data | lateral moves only; Pull-Back [planned: Phase 1 solve] |
| Show Band Overlay | -- | [planned: Phase 2 on-canvas overlay] |
| Add Fog Card | `PXE.addFogCard(z, opacityPct, [r,g,b])` | omitted args use engine defaults |
| Restack Fog | `PXE.restackFog()` | |
| Audit lane toggle | `PXE.auditOn(name)` / `PXE.auditOff()` | one active at a time |
| Audit Off (utilities) | `PXE.auditOff()` | |
| Bake | `PXE.bake()` | inline confirm |
| Reset | `PXE.reset()` | inline confirm |
| Status / scene refresh | `PXE.status()` (interim) / dispatcher `status` cmd | bridge-parsed |
| Flat / Rigged proof toggle | -- | [planned: Phase 2; needs a non-destructive engine suspend/restore command] |

---

## 14. Non-goals and open items

- No settings screen, no theming options, no onboarding tour in v1.
- No batch UI, no band-mask export UI, no depth-map import UI (later phases).
- No micro-motion controls: the one-move-per-shot rule-or-default question is
  Robin's open decision (brief sec. 5); the panel implements current engine
  behaviour (apply replaces) and says so in the Apply tooltip.
- Rig identity is by layer name until Phase 1's id-keyed references land; the panel
  therefore misbehaves on duplicate layer names exactly as the engine does, and
  fixing that is engine work, not panel work.
- The dispatcher command names used here (`depth.set`, `status`, coverage payloads)
  are this spec's requirements on the Phase 1 dispatcher, to be reconciled with the
  dispatcher's own spec when it is written; the `PXEResult` envelope
  `{ok, msg, warnings, data}` is fixed by the architecture review sec. 6.2.
