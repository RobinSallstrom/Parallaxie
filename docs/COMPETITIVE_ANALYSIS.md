# Parallaxie — Competitive Analysis

*Prepared 2026-09-08. Scope: After Effects tools that turn layered art or single images into
camera-animated 2.5D shots, plus the camera-rig and AI-depth tools buyers compare them
against. Reference document; the product conclusions drawn from it are in
`Parallaxie_Brief.md`.*

## 0. Research limits

Read these before trusting any single cell below.

- aescripts.com product pages sit behind a Cloudflare challenge and were truncated before
  the *Reviews* and *Version History* tabs; the Wayback Machine was not reachable. aescripts'
  own review text and changelog dates for Parallaxer 3, AnimateParallax and Camera 3D
  Toolkit Pro could therefore not be read. Version numbers for those come from the official
  Japanese reseller (Flashback Japan), the developer's own site, or third-party listing
  mirrors, and are marked as such.
- Buyer sentiment comes from where it is readable: Videohive comment threads (VoluMax,
  Photomotion, ParaLight), Gumroad listings, Motion Bro's own review count, and Adobe
  Community threads. This skews the complaints section toward the template and
  photo-animator segment. The Parallaxer/AnimateParallax sentiment rows are inference from
  feature descriptions, not verbatim reviews.
- The single highest-value follow-up is twenty minutes reading the two aescripts review
  tabs in a browser.

**Bottom line:** the "layer-to-parallax rig" niche on aescripts is a two-product, $39 niche
(Parallaxer 3, AnimateParallax), both of which stop at *rigging*. Nobody in the AE-layer
segment sells the *shot*: the camera move, the atmosphere, the edge-coverage problem. That
is Parallaxie's opening. But half of what Parallaxie is proud of (frame-0 lock, auto-scale)
is table stakes that every competitor already has, and the real differentiator (reveal-band
maths) is currently an API call, not a feature a buyer can see.

---

## 1. Feature matrix

Legend: **Yes** has it · **Partial** partial or indirect · **No** absent · ? unverified. "Parallaxie" = the v1.2
core as documented in the README (no shipped panel beyond the development ScriptUI skin).

| Feature | **Parallaxie v1.2** | **Parallaxer 3** (Cream-FX) | **AnimateParallax** (TarouTools) | **autoParallax 2** (cumuloworks) | **Camera 3D Toolkit Pro** (E. St Felix) | **Motion Bro AI Parallax Tools V3** | **Depth Scanner 2 / Quick Depth 3** | **VoluMax / Photomotion** (templates) |
|---|---|---|---|---|---|---|---|---|
| Build / convert from layers | Yes from `NN_` naming convention + stacking order; whole comp | Yes one-click whole comp; creates camera; asks scene size S/M/L | Yes select layers → load into panel | Yes select layers → button (user makes camera) | Yes one-click camera + null + 3D on selected | No (single image → AI mesh) | No (produces depth map only) | No (drop photo into template; paint/AI depth map) |
| Depth control UI | slider + numeric per plane (panel); API `setDepth/setDepths` | `−` / `Flat` / `+` nudge buttons on selection; top-view + camera 2-up prompted | Z slider per layer, visual/graph manipulation of Z; Apply | numeric Z or expression (`index*100`) | Spacing controls on X/Y/Z | none (mesh) | none | depth-map paint tools |
| Distribute / randomize | Yes `distribute(near,far,bias)` + bounded `randomize()` | No (only relative nudge) | Yes Distribute + Random buttons | Partial via expressions | Yes Spacing (even) | No | No | No |
| Camera move presets | Yes 6 (Push-In, Pull-Back, Drift L/R, Rise, Sink), strength normalised to mid-plane scale | No (Reset Camera only; you animate) | No | No | Yes Pan/Tilt/Roll automation, speed ramps, 20+ shake presets, Look-At/target, DOF keys | Yes Dolly Zoom, Circular, Orbital, Panoramic + loops | No | Yes preset moves (Photo Animator "13 moves", etc.) |
| Camera rig type | one-node 50 mm cam parented to `PXE_CAM` null; moves on null only | camera created; scene-scale presets Small/Big Room/Exterior | uses existing/created camera; X/Y auto-comp | user's own camera | camera + null controller | internal viewport → rendered mesh | n/a | template-internal |
| Keyframing / easing | eased keys on null, one move per shot | manual | manual | manual | Ease In/Out sliders applied to all keys (v3.1), Overlap Keyframes | preset durations | n/a | template sliders |
| Depth visualisation | Partial audit-mode solo + camera jump; no side-view | Partial relies on AE's Top view (prompts you to set 2-up) | Yes visual Z manipulation in panel (the product's whole pitch) | No | No | Yes 3D viewport preview of mesh | depth map as image | preview comp |
| Fog / atmosphere | Yes fog cards (fractal noise, Screen, drift, rigged as plane) | No | No | No | Partial DepthFade (opacity by camera distance) | Partial lights / blur vignette (AE only) | No | Partial particles, dust |
| Edge / reveal handling | Yes `bands()` / `checkMove()` exact lateral + radial maths; audit solo | No | No | No | No | Partial AI inpaint on mesh edges (stretching typical) | No | No (displacement stretches; users say hole-filling is the hard part) |
| Bake | Yes post-expression sample, strips rig | Partial "2D Convert" documented (returns layers to 2D) | ? | Partial delete expressions = revert (not bake) | ? | mesh is already baked | n/a | n/a |
| Undo / reset | Yes `reset()`; AE undo | Reset Camera, 2D Convert | ? | non-destructive expressions | ? | n/a | n/a | n/a |
| 2D→3D from single image (AI) | No (planned: depth-map import) | No | No | No | No | Yes core feature | Yes (depth map; you build the parallax) | Yes VoluMax "AutoDepth" via Adobe Neural Filters; Photomotion depth module |
| Presets (scene) | Room / Exterior / Epic Vista / Custom | Small Room / Big Room / Exterior | ? | No | No | camera presets | No | many |
| Batch / multi-shot | Partial scriptable core makes it trivial; not exposed | No | No | No | No | No | Yes video frames | No |
| Price | TBD | **$39** (aescripts; SUL/Floating) | **$39** (aescripts; SUL/Floating) | **$15** Gumroad / ¥2,000 BOOTH | **$89** aescripts; PWYW on Gumroad, $89 suggested | **$12** personal / **$24** commercial; free 480p demo | DS2 **$99.99**, DS Lite **$49.99**; QD3 **$99.99** | VoluMax **$45**, Photomotion **$49** (Videohive) |
| AE version support | AE with ExtendScript (any modern) | **CC (2013) → 2026**, Win/mac (Flashback Japan) | **2023 → 2026**, Win/mac (Flashback Japan) | 3D-layer AE; ScriptUI | "all recent" (Gumroad); updated 2026-03-09 | **AE 2025+**; V3 Apple Silicon only | AE + Premiere, macOS ≥11.5, Win; GPU | CC+ |
| UI technology | ExtendScript core; ScriptUI development panel | **ScriptUI** dockable panel (CC-era compat is the tell) | **CEP extension panel** ("extension panel", Flashback) | **ScriptUI panel** (single .jsx, Window menu) | script panel (button-driven) | **CEP** (Motion Bro host extension) + 3D viewport | **native plugin** (AEGP/effect, GPU) | AE project template + Neural Filters script |
| Last update (best available) | 2026-09-08 decoupling commit | Parallaxer 3 launch promo "25% off until Aug 29" (year unverified; 2026 compat listed); v3.0 | v1.4.0 (mirror listings, 2026); v1.2.0 seen July 2025 | v2 current; "1,000+ copies sold" | v3.1, 2026-03-09 | V3 announced 2025-06-27 | DS Lite updated 2026-03-09; DS2 adds Depth Anything v3 | VoluMax 2024-02-02; Photomotion 2025-01-15 |

Secondary and long-tail entries, for completeness; none is a serious threat:

| Tool | What it is | Price | Notes |
|---|---|---|---|
| Pearelax (AE Screens, Gumroad) | panel: move/resize in 3D retaining optical size | $29 | same "auto-scale" primitive, no moves |
| GenKiParallaxer (Gumroad) | panel with curve editor for Z, FOV-matched scale, keyframes, TimeShift | free | free "graph UI" — undercuts AnimateParallax's core pitch |
| Mestre do Parallax (Gumroad, PT-BR) | one-click setup + "Frame Target" camera keys + wiggle | $5 | "30 minutes → 3 seconds" messaging |
| ParaLight (Videohive) | 2.5D script, 406 sales, 5.0/5 (5 reviews) | $22 | last update **2016**; English-AE-only; abandoned |
| iExpressions 3 "Auto Scale" (mamoworld) | general iExpression that keeps camera-apparent size while moving in Z | part of iExpressions | aescripts' own 2021 blog uses it for 2D→3D photo parallax |
| Projection 3D V5 (Nataworkstudio, aescripts) | camera projection mapping + photo parallax | $65 | heavier, different job |
| Immersity AI (ex-LeiaPix, web) | single image → 2.5D parallax video | freemium | reviews cite edge artifacts / stretching |

Sources: [Parallaxer 3 (aescripts)](https://aescripts.com/parallaxer/), [Parallaxer 3 (Flashback Japan, full description + compat)](https://flashbackj.com/product/parallaxer), [AnimateParallax (aescripts)](https://aescripts.com/animateparallax/), [AnimateParallax (Flashback Japan)](https://flashbackj.com/product/animate-parallax), [autoParallax 2 site](https://autoparallax.cumulo.works/), [autoParallax 2 Gumroad](https://cumuloworks.gumroad.com/l/autoparallax2), [Camera 3D Toolkit Pro (aescripts)](https://aescripts.com/camera-3d-toolkit-pro/), [Camera 3D Toolkit Pro feature detail](https://aaeplugins.com/plugins/camera-3d-toolkit-pro/), [Camera3D Toolkit Pro Gumroad](https://saintfelix2.gumroad.com/l/mdcsyh), [Motion Bro AI Parallax Tools](https://motionbro.com/products/ai-parallax-tools/), [Motion Bro V3 announcement](https://motionbro.com/blog/updates/convert-2d-to-3d-directly-in-after-effects-premiere-pro-free-ai-parallax-tools/), [Depth Scanner 2](https://aescripts.com/depth-scanner/), [Depth Scanner Lite](https://aaeplugins.com/plugins/depth-scanner-lite/), [Quick Depth 3](https://aescripts.com/quick-depth/), [VoluMax (Videohive)](https://videohive.net/item/volumax-3d-photo-animator/13646883), [Photomotion (Videohive)](https://videohive.net/item/photo-motion-pro-professional-3d-photo-animator/13922688), [Pearelax](https://aescreens.gumroad.com/l/pearelax), [GenKiParallaxer](https://genkicomp.gumroad.com/l/GenKiParallaxer), [Mestre do Parallax](https://9402278593723.gumroad.com/l/mestredoparallax), [ParaLight](https://videohive.net/item/paralight-after-effects-script-for-parallax25d-animation/17947707), [iExpressions Auto Scale docs](https://docs.mamoworld.com/iexpressions/camera/auto-scale/), [aescripts blog: 2D→3D photo parallax with iExpressions (2021)](https://aescripts.com/learn/post/2d-to-3d-photo-in-adobe-after-effects-parallax-effect), [Projection 3D V5](https://aescripts.com/projection-3d/), [Immersity AI review](https://leaveit2ai.com/ai-tools/image/immersity-ai).

---

## 2. What users praise and complain about, per tool

### Parallaxer 3 (Cream-FX) — $39, ScriptUI
- **Praise (inferred from positioning and track record):** the *one-click* promise and the auto-scale ("move layers in depth without resizing them"). Cream-FX is a Power Elite Envato author (~30k sales, VoluMax ~25k), and Parallaxer 2 was "the most popular video add-on in 2023" on Envato — a brand with an audience, not an indie script. [Envato author story](https://hub.author.envato.com/author-stories/meet-our-authors-cream-fx/)
- **Weaknesses visible in the documented workflow** ([Flashback Japan](https://flashbackj.com/product/parallaxer)): the build is a chain of modal alerts ("Script Alert… click Yes", "Choose your type of scene", "Setup the viewport in 2 views: TOP + CAMERA — do it yourself"). Depth is *relative* nudging (`−`/`Flat`/`+`) on a selection — no absolute per-layer value, no distribute. It stops at the rig; the user animates the camera. No fog, no coverage tooling.
- **Piracy signal:** Parallaxer 2 is re-uploaded as "free" and "$10" on Gumroad by third parties ([1](https://yaduvanshink.gumroad.com/l/parallax), [2](https://motionstar.gumroad.com/l/PARALLAXER-2)) and the Videohive listing is now gone (410). The move to aescripts' licensing framework is plausibly a response. Expect the same for any successful tool in this niche; aescripts licensing is the standard mitigation.
- **Reviews on aescripts:** not readable (see §0).

### AnimateParallax (TarouTools) — $39, CEP
- **Praise (as positioned):** "visually manipulate Z-space" — the whole pitch is *seeing* depth per layer in a panel, plus Distribute and Random buttons; "specify only Z, X/Y are auto-adjusted" ([Flashback Japan](https://flashbackj.com/product/animate-parallax)). Parallaxie's brief already credits this as the ambition worth adopting.
- **Weaknesses:** AE 2023+ only (CEP). No camera work at all — it is a depth-layout tool. Active cadence (v1.2.0 mid-2025 → v1.4.0 in 2026 per mirror listings) means the developer is still iterating; expect them to add things.
- **Reviews on aescripts:** not readable. A free Gumroad panel (GenKiParallaxer) offers a curve editor for Z, which erodes the "visual Z" moat.

### autoParallax 2 (cumuloworks) — $15
- **Praise:** "zero-drift" (layers keep exact on-screen position/size on conversion), fully non-destructive (two expressions on Position/Scale; delete to revert), "1,000+ copies sold on Gumroad and BOOTH", bilingual EN/JA. [site](https://autoparallax.cumulo.works/)
- **Weakness:** everything else is manual: the user makes the camera, sets Z by hand or expression, animates. It is a primitive, not a workflow. It also proves that "frame-0 lock" is a *$15 feature*.

### Camera 3D Toolkit Pro (Edgard St Felix) — $89 aescripts / PWYW Gumroad
- **Praise (as positioned):** the closest thing to Parallaxie's MOVE step sold today — one-click rig, Pan/Tilt/Roll automation, speed ramps, global Ease In/Out sliders (v3.1), 20+ shake presets, Look-At targeting, autofocus, DepthFade, "Overlap Keyframes" to blend moves. Updated 2026-03-09. [aaeplugins](https://aaeplugins.com/plugins/camera-3d-toolkit-pro/)
- **Weakness:** it is a general camera toolkit, not a parallax converter: no naming-convention build, no per-layer depth authoring, no coverage awareness. At $89 it sits above the parallax pair. But if a buyer already owns it, Parallaxie's six moves look thin by comparison — Parallaxie needs to be *better at parallax moves*, not merely have moves.

### Motion Bro AI Parallax Tools V3 — $12/$24, CEP, 4.75/5 from 132 reviews
- **Praise:** single image → AI 3D mesh inside AE/Premiere, viewport preview, preset camera moves (Dolly Zoom, Circular, Orbital, Panoramic), loops, transitions; 4.75/5 across 132 reviews on the developer's page. [product](https://motionbro.com/products/ai-parallax-tools/)
- **Complaints / limits:** free tier is 480p texture; V3 is Apple-Silicon-only on Mac; requires AE 2025+; depends on the Motion Bro host extension. AI-mesh parallax stretches edges on strong moves — this is inherent, and it is the segment Immersity AI reviews also fault ("edge artifacts, stretching"). [review](https://leaveit2ai.com/ai-tools/image/immersity-ai)
- **Why it matters:** this is where the *volume* buyer is going: cheap, AI, one image. It is not Parallaxie's buyer (studios and designers with proper layer separation), but it sets the price anchor and the "one click" expectation.

### Depth Scanner 2 / Lite, Quick Depth 3 — $49.99–$99.99, native GPU plugins
- **Praise:** state-of-the-art depth (Depth Anything v3, 8 models, temporal consistency), used to "create parallax from flat footage". [DS Lite](https://aaeplugins.com/plugins/depth-scanner-lite/), [QD3](https://aescripts.com/quick-depth/)
- **Reality:** they output a depth map; the parallax rig is still the user's problem. Complementary, not competitive — a Parallaxie "import depth map → assign plane depths" feature would ride on them rather than fight them.

### VoluMax (Cream-FX) / Photomotion (Integnity) — $45/$49 templates, ~26k sales each, 4.81/5
- **Praise:** breadth (particles, water, portrait, 120+ min tutorials), "A+ customer service" (VoluMax). [VoluMax comments](https://videohive.net/item/volumax-3d-photo-animator/13646883/comments)
- **Complaints (verbatim themes):** host-application updates break VoluMax's Neural-Filter depth script (users report that a new Neural Filters version broke the AI script, and incompatibility with a specific 26.4.1 host release); tutorial links 403; particles not visible on M3 / AE 2025; Photomotion: "outdated tutorials from 2019 don't match current software", activation hangs, unresponsive support during an email migration. [Photomotion comments](https://videohive.net/item/photo-motion-pro-professional-3d-photo-animator/13922688/comments)
- **Lesson:** the complaints are almost never about the *effect*; they are about **fragility across host-app updates, dead tutorial links, activation and support**. Polish and maintenance are the product.

### ParaLight (Videohive, 2016)
- Complaints: only works in English-language AE ("try to switch AE to English"), controller not appearing in newer AE, `Function Alert is undefined` script errors. [comments](https://videohive.net/item/paralight-after-effects-script-for-parallax25d-animation/17947707/comments)
- **Lesson:** use `matchName`s and language-safe property access; never depend on display names. A tool that dies on a non-English AE gets one-star reviews from half of Europe and Asia.

### The manual baseline (what people do without a tool)
Adobe Community expert on VoluMax vs Photomotion: "the hardest part of the process is filling in the holes when you cut out something from the background… lots of elbow grease." [thread](https://community.adobe.com/t5/after-effects-discussions/3d-photo-animation-volumax-photomotion-or-something-else/m-p/10433587). Motion Design School's parallax guide lists the pain as masks/roto separation and performance ([guide](https://motiondesign.school/blog/parallax-in-after-effects/)). **Nobody's tool addresses the hole/backfill problem. That is exactly what Parallaxie's reveal-band audit is about — and no buyer can currently tell.**

---

## 3. UX patterns worth adopting — and the ones to avoid

**Adopt**
1. **Selection-based build as a first-class path** (Parallaxer, AnimateParallax, autoParallax all do "select layers → go"). The `NN_` naming convention is right for a studio pipeline; for a buyer it is a barrier at minute one. Offer *Build from selection (stacking order = depth)* as default and *Build from naming* as the "pipeline" option. Keep the invariant either way.
2. **See depth without leaving the panel** (AnimateParallax's pitch; GenKiParallaxer's curve editor; Motion Bro's viewport). Even in ScriptUI, a custom-drawn side-view strip (planes as bars at their Z, camera at left) in an `onDraw` handler is feasible and beats sliders alone. Buyers judge "visual" from the screenshot.
3. **Global easing controls** (Camera 3D Toolkit Pro v3.1's Ease In/Out sliders): Parallaxie's moves have baked easing; expose one "ease" control and a duration field, nothing more.
4. **Non-destructive with a visible escape hatch** (autoParallax "delete the expression, you're back"; Parallaxer "2D Convert"). Parallaxie has `reset()`; surface it as a big, boring, always-visible button.
5. **Demo that is the licensed build** (aescripts standard: same installer, limited until activated). Plan the trial limitation now so the code path exists.
6. **Tutorial links that live on the product page and in the panel Help menu**, not on a domain that will 403 in two years (VoluMax/Photomotion complaints).

**Avoid**
1. **Modal-alert chains during build** (Parallaxer 3: alert → Yes → choose scene → "set up 2 views yourself"). Build should be silent, with a single non-modal status line. The `preflight()` report belongs in the panel, not in `alert()`.
2. **Relative-only depth nudging** (`−`/`Flat`/`+`) with no absolute readout. Always show the number.
3. **Making the user set up AE's view layout** by instruction. If a top view helps, offer a one-click "Open side view" that creates and arranges it, or draw your own.
4. **Display-name / English-only dependencies** (ParaLight).
5. **Host-update fragility** (VoluMax's Neural Filters script). Parallaxie's rig is pure expressions plus a point control; keep it that way and re-run the suite on every AE beta.
6. **Feature sprawl of the template kind** (particles, water, transitions). It sells templates; it does not sell a professional rig. Fog cards are on the right side of that line; "3D transitions" would not be.

---

## 4. Gaps nobody fills — and an honest audit of Parallaxie's differentiators

### Gaps in the market

| Gap | Evidence | Parallaxie today | What a buyer would need to see |
|---|---|---|---|
| **Coverage / reveal-band awareness** — knowing *before* animating which plate will run out of paint, and by how much | Adobe forum: hole-filling is "the hardest part"; no AE-layer tool addresses it; AI mesh tools stretch edges | `bands()`, `checkMove()`, audit solo — API plus a solo toggle | A **"Coverage check"** row per plane in the panel: green/amber/red, "Push-In 5% safe · 7% exposes 04_NEAR right edge by 38 px"; a **"Max safe strength"** button that solves for the largest strength with full coverage; a **visual band overlay** (a shape layer or guide showing the exposed strip on the plate); **"Export band mask (PNG/PSD)"** so the paint pass knows exactly what to fill. This closes the backfill loop *and* is the only defensible moat in the table. |
| **The shot, not the rig** — a finished, tasteful move in one click | Parallaxer/AnimateParallax stop at layout; Camera 3D Toolkit is generic; Motion Bro has moves but only for AI mesh | 6 moves, strength normalised to mid-plane apparent scale | Keep it. Market the normalisation ("5% means 5% on any scene") — it is real and nobody else defines strength perceptually. But see "one-move rule" below. |
| **Atmosphere between planes** | only Camera 3D Toolkit's DepthFade comes close | fog cards | Ship as-is; add "auto-suggest fog slots from largest Z gaps". Small but visible in the demo video. |
| **Studio batch** | none of the parallax tools batch | trivially scriptable, not exposed | "Build all comps in folder / apply this move to N shots". Niche but exactly the studio buyer. |
| **Convention-driven pipelines** (layered file → AE with predictable naming) | none | `NN_` build, FX co-planar, hidden-layer reporting | Sell as "pipeline mode" to studios; do not make it the only door. |

### Skeptical audit of the current differentiators

| Differentiator | Does a buyer care? | Verdict |
|---|---|---|
| **Frame-0 pixel lock (md5-tested)** | They care that *nothing jumps*. But every competitor already claims this: Parallaxer "autoscale", AnimateParallax "X/Y auto-adjusted", autoParallax "zero-drift" ($15), Pearelax "retains optical size" ($29), iExpressions Auto Scale. | **Table stakes, not a differentiator.** Internal QA virtue. Translate into one user-facing thing: a **"Flat / Rigged" A-B toggle** in the panel that proves it live — and keep the md5 test in CI, silently. Do not lead marketing with it. |
| **Reveal-band maths (exact lateral + radial)** | Nobody knows they need it until a plate tears on the client review. It is the *only* thing in the table no competitor has and that speaks to the "hardest part" of the craft. | **The moat — but currently invisible.** It must become a panel feature with a picture (see gap table). "Correct radial maths" is engineering pride; "this tells you how many pixels to paint, and where, before you start" is a purchase reason. |
| **One camera move per shot** | A style rule. Buyers will read "you can't combine moves" as a limitation, especially next to Camera 3D Toolkit's Overlap Keyframes and shake presets. | **Reframe, don't enforce.** Default to one move; call it "Cinematic mode"; allow an additive micro-motion layer (breath/drift) and, later, a second move with a warning from `checkMove()`. The *normalised strength* is the transferable value, not the prohibition. |
| **Scriptable core (`$.global.PXE`), LLM-drivable, 49 tests** | Buyers do not buy a test suite. A small subset (studio TDs) buys an API. | **Internal virtue with two external payoffs:** (a) batch/multi-shot features that competitors structurally cannot ship fast; (b) reliability across AE updates — the exact failure mode buyers punish (VoluMax, ParaLight). Mention "documented scripting API" on the product page for the TD crowd; sell the *results* (batch, stability) to everyone else. |
| **Fog cards** | Yes, modestly — it is the visible "look" in the demo. | Keep; unique in the segment. |
| **Build from naming convention** | Studios: yes. Everyone else: friction. | Provide both doors (see §3). |
| **Depth from stacking order** | Correct and invisible. | Keep; it prevents the inverted-scene bug class, which is a review-killer. |

### Things Parallaxie lacks that buyers now expect
- **Single-image path.** The volume buyer in 2025–26 has one JPG, not a layered PSD (Motion Bro 132 reviews; Depth Scanner/Quick Depth at $99.99; Immersity). Parallaxie should *not* build an AI mesh tool — GPU/ML, cross-platform, model licensing, and it is a different product. But a **"depth map → plane depths"** import (from Depth Scanner/Quick Depth output) and a documented layer-separation workflow (what to cut, how much bleed to paint) keep it in the conversation.
- **A visual depth view.** AnimateParallax's whole pitch. Sliders lose the screenshot war.
- **AE 2023–2026 compatibility list, docs, video, changelog** — the aescripts page furniture. Not optional (see §6).

---

## 5. UI technology — the evidence

The decision is the owner's; this section is the evidence.

**What the market uses (this niche, 2026):**
- Parallaxer 3 — **ScriptUI** dockable panel; the CC (2013) → 2026 compatibility list is only achievable with ScriptUI. [Flashback Japan](https://flashbackj.com/product/parallaxer)
- autoParallax 2, Camera 3D Toolkit Pro, ParaLight — **ScriptUI / plain scripts**.
- AnimateParallax — **CEP extension** (AE 2023+, "extension panel", visual Z UI). [Flashback Japan](https://flashbackj.com/product/animate-parallax)
- Motion Bro — **CEP** host with an embedded 3D viewport. Top-trending aescripts panels (Flow, GEOlayers 3, Easify 4) are CEP; GPU effects (Deep Glow 2, Depth Scanner) are native plugins. [aescripts trending](https://aescripts.com/trending)

**Platform status (dated):**
- **UXP panels for After Effects do not exist as of April 2026**; AE exposes scripting-only UXP APIs. **CEP is "still fully supported in AE"**, no deprecation signal for AE; ExtendScript/ScriptUI remains viable. [pushREC UXP status note, Apr 2026](https://github.com/pushREC/after-effects-sdk-kb/blob/main/scripting/UXP-STATUS-NOTE.md)
- Premiere Pro shipped UXP as GA in Premiere 2026 (beta since Dec 2024) and Adobe has said CEP will stop working in *future Premiere* versions, "several years" out, no date. [Hyper Brew](https://hyperbrew.co/blog/uxp-plugins-in-premiere-2026/)
- July 2026 industry read: AE "has barely started… AE plugins will remain CEP-based for a good while longer than Premiere's." [filmit.io](https://filmit.io/blog/future-of-adobe-plugins-uxp-cep-ai)
- A developer asked Adobe for a CEP/UXP roadmap on 2026-01-08; zero replies. [Adobe Community](https://community.adobe.com/questions-606/cep-uxp-roadmap-should-developers-stop-building-cep-plugins-and-what-happens-to-existing-ones-1614807)
- aescripts' Manager App installs scripts, ScriptUI panels and CEP/UXP (via UPIA); ZXP/UXP Installer handles `.zxp`/`.ccx`. Their licensing framework "supports a variety of popular coding languages" (ExtendScript, JS/CEP, C++). [Manager App FAQ](https://aescripts.com/faq/article/view/faq/aescripts-aeplugins-manager-app-faq/), [ZXP/UXP Installer FAQ](https://aescripts.com/knowledgebase/index/view/faq/zxp-installer-faq/), [Become an Author](https://aescripts.com/faq/article/view/faq/become-an-author/)

**Tradeoffs for Parallaxie specifically**

| | ScriptUI (ExtendScript) | CEP (HTML panel + ExtendScript core) | UXP |
|---|---|---|---|
| Time to ship v1 | shortest; core already ExtendScript | +2–4 weeks (Bolt-CEP scaffold, evalScript bridge, packaging/signing) | not possible for AE panels today |
| Visual depth view | possible but laborious (custom `onDraw`); no drag-graph polish | easy (canvas/SVG); parity with AnimateParallax, room to beat it (band overlays, coverage bars) | — |
| Compatibility | widest (any AE with ExtendScript); matches Parallaxer's CC→2026 | AE 2023+ realistically (matches AnimateParallax) | — |
| Longevity risk | ExtendScript is old but has no announced AE end date | CEP has an *eventual* Premiere sunset; AE unannounced; a port to UXP later is a UI rewrite, not a core rewrite | future-proof, unavailable |
| Perceived polish on aescripts | "script" look; buyers accept it at $29–39 (Parallaxer) | "product" look; expected at $49+ | — |
| Licensing | aescripts framework supports it | supported | — |
| Parallaxie's architecture | thin skin over `PXE` — trivial | thin skin over `PXE` via `evalScript` — the existing core/UI split makes this cheap; the ExtendScript core is the part that survives any UI change | same core would need porting to UXP scripting eventually |

**Read of the evidence, not a decision:** the core/UI separation means the UI choice is reversible; the ExtendScript core is the durable asset. ScriptUI gets to market at Parallaxer parity fastest; CEP is what it takes to *beat* AnimateParallax on the visual axis and to render coverage overlays convincingly; UXP is off the table for at least one more AE cycle. Several top tools shipped ScriptUI first and moved to CEP later. (The architecture review §5 qualifies the "survives any UI change" claim: it is established for ScriptUI-to-CEP and unknown for UXP.)

---

## 6. Pricing landscape, and what "top choice" costs in polish

**Price bands observed**
- $0–$15: Gumroad primitives (autoParallax 2 $15, Pearelax $29, GenKiParallaxer free, Mestre do Parallax $5)
- **$39: the two aescripts parallax rigs** (Parallaxer 3, AnimateParallax), SUL + Floating options
- $45–$49: Videohive photo-animator templates (VoluMax, Photomotion; ~26k sales each, 4.81/5)
- $12–$24: Motion Bro AI Parallax Tools (AI single image)
- $89: Camera 3D Toolkit Pro (camera automation)
- $99.99: AI depth plugins (Depth Scanner 2, Quick Depth 3); DS Lite $49.99

Implication: a parallax *rig* has a hard ceiling around $39–$49 unless it demonstrably does more than rig. Parallaxie's case for $49 (or $39 launch / $59 later) is only credible if the coverage check and moves are visible in the first 60 s of the demo. "Name Your Own Price" is common on aescripts for utilities and could be a launch tactic, but note aescripts' policy that NYOP upgrades are usually re-purchases. [upgrade FAQ](https://aescripts.com/knowledgebase/index/view/faq/how-to-upgrade-to-the-latest-version/)

**aescripts marketplace mechanics to satisfy**
- Submit via the author portal; flat 30% commission; integrated licensing framework; Manager App handles install/trial/license; admin-assisted ticketing; authors' Discord; marketing to 500k+ social / 100k+ newsletter. [Become an Author](https://aescripts.com/faq/article/view/faq/become-an-author/)
- Single User License = up to **two** machines, one at a time; Floating and Render-only licenses exist. [License Type FAQ](https://aescripts.com/knowledgebase/index/view/faq/license-type-faq/)
- Trial = same installer, limited until licensed (Flashback Japan describes this for both competitors). Decide the limitation.
- Major versions are paid upgrades; minor updates free. [upgrade FAQ](https://aescripts.com/knowledgebase/index/view/faq/how-to-upgrade-to-the-latest-version/)
- Product page furniture that buyers *read*: compatibility list per AE version (Parallaxer lists CC→2026 explicitly), version history with dates, embedded tutorial video, reviews tab. An empty version history or a 3-version compat list reads as "hobby project."

**What "top choice" requires beyond features** (ranked by how often its absence generates complaints in the threads above)
1. **Survive host updates.** Every VoluMax/ParaLight complaint is "AE/host update broke it." The self-contained suite is the asset here — run it against each AE beta and *say so* in the changelog ("Tested on AE 26.3 beta"). That sentence sells.
2. **Tutorials that don't rot**: one 3–5 min overview video (the aescripts page embeds it), one 10-min "layered art → finished shot" walkthrough, hosted on YouTube, linked from the panel's Help. Photomotion is still paying for 2019 tutorials.
3. **Trial that shows the coverage check**, not just the rig — it is the thing nobody else has.
4. **Localisation-safe code** (`matchName`, no display-name lookups), Win + mac tested, no emoji in labels.
5. **Changelog cadence**: AnimateParallax shipped ≥3 point releases in ~12 months; Camera 3D Toolkit updated March 2026. A tool with no update in 12 months slides down the "trending" page.
6. **Support SLA**: aescripts tickets; answer within a business day. Photomotion's rating survived only because the author eventually replied publicly.
7. **A self-contained test fixture.** A suite that needs proprietary art cannot ship, and "tested" cannot be claimed without the suite. (Resolved on 2026-09-08 with `PXE_Fixture.jsx`; the first baseline on it is still to be captured.)

---

## 7. Recommendations (for the owner to weigh, not a plan)

1. **Turn the reveal-band maths into the headline feature**: per-plane coverage status, max-safe-strength solver, on-canvas band overlay, band-mask export for the paint pass. This is the only cell in the matrix that is uniquely Parallaxie's *and* maps to the pain buyers name.
2. **Demote frame-0 lock to a proof toggle** and a CI test; stop treating it as a differentiator — four competitors sell it for ≤$39, one for $15.
3. **Reframe "one move" as a default, not a rule**; add micro-motion; let `checkMove()` warn on combinations rather than forbidding them.
4. **Two build doors**: selection-based (default) and naming-convention (pipeline). Depth from stacking order in both.
5. **Add a visual depth view** in whatever UI technology is chosen; ScriptUI can do a static side-view, CEP can do the AnimateParallax-class interaction plus band overlays.
6. **UI tech**: evidence favours shipping ScriptUI now if speed matters, CEP if beating AnimateParallax on the visual axis matters; UXP is not an option for AE panels in 2026. The core stays ExtendScript either way.
7. **Pricing**: enter at $39 to match the pair, with a documented path to $49–59 once coverage tooling and batch ship; or launch NYOP to seed reviews and convert to fixed price at v2. Both are defensible; $89 is not, whatever the feature count.
8. **Before submission**: compat list 2023→2026 (2022 if it passes), two videos, trial limitation, `matchName` audit. (The synthetic fixture, the version string and the env-var for the bridge path, listed here originally, were done on 2026-09-08.)
