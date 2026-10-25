# Parallaxie — Roadmap

*2026-09-08. Phases are ordered by dependency, not by calendar. Each item is one line:
what, and why. Items marked **[UI]** wait on the UI-technology decision in
`Parallaxie_Brief.md` §7; everything else can proceed now. Defect numbers refer to
`docs/ARCHITECTURE_REVIEW.md` §3; gaps and patterns refer to `docs/COMPETITIVE_ANALYSIS.md`.*

## Phase 0 — Prove the ground (now)

- **Run the suite in AE on the synthetic fixture** — the fixture and the portable harness
  have never been executed; until they are, "49 passing" is a prediction.
- **Check the first run by eye against the predicted detail strings** (review Appendix B),
  in particular 9.6's first-failure percentage — the legacy baseline says 10.0%, the current
  code should say 0.0%; a third value means the code and our reading of it disagree.
- **Commit the run as `_pxe_test/report.txt`** — it becomes the regression reference every
  later change diffs against.
- **Verify the frame-0 lock on the fixture** with `tools/verify_frames.py` — the off-centre
  gate exercises the identity on both axes for the first time.
- **Run the four one-line verifications in the review's Appendix A** (Fractal Noise
  parameter indices, 3D sort vs stack order, `activeCamera` with no camera, md5 under
  Advanced 3D and at a fractional position) — each one decides whether a later item is a
  bug fix or a non-issue.

## Phase 1 — Harden the core

Prerequisite for any UI and for any public release. Nothing here depends on the UI decision.

- **Multiply existing scale instead of discarding it; restore the captured base on Reset**
  (#1) — the first scaled layer in any real comp jumps today.
- **Preflight BLOCKER for parented layers plus an unparent-keeping-transform path** (#2) —
  every motion designer uses controller nulls.
- **Preflight BLOCKER for keyframed position/scale; Bake and Reset refuse or handle keyed
  properties cleanly** (#3) — today they throw mid-loop inside one undo group.
- **Preflight BLOCKER for locked layers; Build never partially rigs** (#4).
- **Renderer check with a one-click switch to Classic 3D; run the suite under Advanced 3D
  and record what differs** (#5) — the lock is a claim about one renderer.
- **matchName-only ExtendScript, index-form expression lookups, and a lint that fails the
  build on display-name access or `alert()` in the core** (#6) — non-English AE is half of
  the market and the source of ParaLight's one-star reviews.
- **Undo hygiene everywhere: begin first, `try/finally`, one group per drag** (#7).
- **Idempotent Build (keep depths unless asked) and a real migrate path for partial rigs**
  (#8).
- **Return structured results (`{ok, msg, warnings, data}`) through a `PXE.call(json)`
  dispatcher, keeping the string functions as wrappers** (S3; review §6.2) — needed by any
  UI that shows more than one line, and by the suite.
- **Rig identity by tag and `layer.id`, not by display name; accept id, index or Layer on
  the API** (#16) — duplicate names are normal in flattened files.
- **Explicit comp on every API call** (#19) — `activeItem` can change between two calls.
- **Store the rig centre on the null; detect and offer to re-centre after a comp resize**
  (#10).
- **Tie camera position to zoom by expression so focal length becomes a feature, not a
  trap** (#11).
- **Guard `activeCamera` in the expressions; warn when a pre-existing camera is displaced**
  (#12).
- **Link FX riders to their host plane so they follow every depth op, not only Build**
  (#13).
- **Verify and fix the Fractal Noise parameters; drop the `try/catch` that hides a static
  fog card** (#14).
- **Track-matte pairs detected in preflight and rigged together or blocked** (#20).
- **Pull-Back first-failure solve; closed-form max-safe-strength for all six moves** (#17)
  — the coverage headline in Phase 2 needs it.
- **Extended fixture variants and new suite sections** (review §4.4): scaled, parented,
  keyed, locked, user camera, matte, Advanced 3D, non-square PAR, duplicate names, resize
  after rig, zoom change, the five untested moves, Pull-Back exposure, FX after
  `distribute`, Build idempotence — the suite becomes a coverage suite, not only a
  regression suite.
- **Rename before anything ships: the `PXE_CAM` null, the `P Base Position` control, the
  "Audit Band" label** (S3) — renames after release cost a migration path forever.
- **Single-source the version string** (S3) — the suite currently hard-codes `"1.2"`.

## Phase 2 — Make the moat visible (user-facing features)

Engine work here is UI-agnostic; the surfaces that show it are marked.

- **Per-plane coverage status for the chosen move and strength, with pixel counts** — the
  one thing no competitor has, mapped to the pain buyers name. **[UI]** for the display;
  the data comes from `checkMove` today.
- **Max-safe-strength solver as a single action** — "how hard can I push before the sky
  plate tears" answered in one click. Needs the Phase 1 Pull-Back solve.
- **On-canvas band overlay** — a guide shape layer created by the core showing the exposed
  strip on each plate; technology-agnostic, and the picture that sells the feature.
- **Band-mask export (PNG, and PSD as a target for the paint pass)** — closes the loop: the
  backfill is painted exactly where the move will look.
- **Selection-based build as the default door, naming-convention build as the pipeline
  door; stacking order as depth in both** — the `NN_` prefix is friction at minute one for
  everyone who is not a studio.
- **Visual depth view** — planes as bars on a Z axis, camera at the left, coverage status
  per plane. **[UI]**: static side-view strip in ScriptUI, draggable graph in CEP; build it
  once, in the technology that ships.
- **Global ease control and a start-time choice (t=0, CTI, work-area start) for moves** —
  Camera 3D Toolkit's ease sliders set the expectation; keys at absolute zero surprise
  buyers.
- **Additive micro-motion layer (breath, drift) on top of the one move** — "one move" stays
  the default without reading as a prohibition. Depends on Robin's rule-or-default
  decision.
- **`checkMove` warning on move combinations if a second move is ever allowed** — the
  normalised strength is the transferable value, not the ban.
- **Auto-suggest fog slots from the largest depth gaps** — small, visible in every demo.
- **"Flat / Rigged" proof toggle in the panel** — the frame-0 lock as something a buyer can
  see live, instead of a claim. **[UI]**
- **Preflight, coverage and the full multi-line result in the panel** — the rules in
  `CLAUDE.md` cannot currently be followed from the UI at all. **[UI]**
- **Batch: build and apply a move across every comp in a folder; one report per shot** —
  trivially scriptable, not exposed; the studio buyer's feature and one competitors cannot
  ship fast.
- **Depth-map to plane-depths import** (from Depth Scanner / Quick Depth output) — keeps
  Parallaxie in the single-image conversation without building a mesh tool.
- **A written page on the reveal-band maths** — the product's thesis currently lives in a
  README paragraph.

## Phase 3 — Ship

- **Build the public panel per the decision** — CEP (Bolt-CEP, TypeScript, small framework)
  over the ExtendScript core, or the hardened ScriptUI panel as the v1 product. **[UI]**
- **Repo refactor to `src/core` + `tests/` + `dist/` with a concat/stamp build** (review
  §6.1) — move all `$.fileName`-dependent files together, in one commit, with the suite
  passing before and after.
- **Licensing seam** (`PXE.license`, swappable provider, stub for the suite) — the aescripts
  framework plugs in here; the core is never gated on a network call at load.
- **Trial design implemented so the code path exists** — the review's recommendation: full
  Build, Depth, Move, Preflight and Coverage; cap on rigged planes; Bake and band-mask
  export disabled; no render watermark. Robin decides the exact cap.
- **AE version matrix run and stated**: AE 2022–2026, Windows and macOS (Intel and Apple
  Silicon), Classic 3D and Advanced 3D, both expression engines; every beta re-run and
  named in the changelog — the single sentence buyers reward most.
- **Manual pass in a second-language AE install before each release** — the lint catches
  the code; only a real install catches the expressions.
- **Two artefacts from one build with identical core bytes**: self-contained ScriptUI
  `.jsx` and, if CEP, a signed `.zxp`. **[UI]** for the second.
- **Release gate script: build, lint, run suite, verify frames, package** — one command,
  honest exit code; this script is the CI.
- **Tutorial videos**: a 3–5 minute overview and a 10 minute "layered art to finished shot"
  walkthrough, on YouTube, linked from a Help button — not from a domain that will 403 in
  two years.
- **Dated changelog, compatibility list and reveal-band page as product-page furniture** —
  an empty version history reads as a hobby project.
- **Pricing decision** — $39 to match the pair with a documented path to $49–59, or
  name-your-own-price to seed reviews; not $89.
- **aescripts submission** via the author portal; support plan of one business day per
  ticket; a release cadence that never leaves twelve months idle.

## Watching, not doing

- **UXP panels for After Effects** — do nothing until Adobe ships them; when they do,
  check first whether a UXP panel can drive an ExtendScript core, because that decides
  whether the port is a UI rewrite or a core rewrite.
- **AnimateParallax's cadence** — three point releases in twelve months; expect the visual
  axis to keep moving.
