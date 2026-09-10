# Parallaxie — CEP Platform Notes

*Researched 2026-09-08 (web-verified). Purpose: pin the toolchain and platform facts for the
CEP panel build (Brief §7, roadmap Phase 2+). Supersedes the platform claims in
`Parallaxie_Brief.md` §7 and `docs/COMPETITIVE_ANALYSIS.md` §5 where flagged below; those
documents remain the authority on the product decision itself.*

## 0. Corrections to the brief — read first

1. **"CSXS 11 covers AE 22.0 through 2026" (Brief §7) is out of date as a runtime claim.**
   CEP 12 exists and shipped with After Effects **25.0** (AE 2025), Premiere Pro 25.0 and
   Photoshop 25.12 — announced on the Adobe Tech Blog 2024-11-12
   ([Updates for Creative Cloud Desktop Extensibility](https://medium.com/adobetech/updates-for-creative-cloud-desktop-extensibility-0dd5c663563e),
   confirmed by the [CEP 12 HTML Extension Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md)).
   So AE 22.0–24.x run **CEP 11** and AE 25.0–26.x (2025, 2026) run **CEP 12**.
   **The conclusion the brief draws survives**: one manifest still covers AE 22.0–2026,
   because the manifest's `RequiredRuntime` CSXS version is a *floor*, not a pin (see §2).
   What changes in practice: two debug registry keys (`CSXS.11` **and** `CSXS.12`), and the
   panel must be tested under both embedded browsers (Chromium 88 vs Chromium 99).
2. **Bolt-CEP's officially supported floor is "Adobe CC 2024 or later"**
   ([bolt-cep README](https://github.com/hyperbrew/bolt-cep), read 2026-09-08). Nothing in
   the generated extension is technically CC-2024-only (it declares `RequiredRuntime` CSXS
   9.0), and CEP 11 hosts back to AE 18.4 accept it, but AE 2022/2023 are outside Hyper
   Brew's tested matrix. The Brief §8 compatibility promise (AE 2022–2026) therefore needs
   explicit testing of the scaffolded panel in AE 22.x and 23.x — do not assume it.
3. Everything else checked (UXP-for-AE absent, CEP not deprecated for AE, aescripts
   supports ZXP) is **consistent** with `COMPETITIVE_ANALYSIS.md` §5 as of 2026-09-08.

---

## 1. Bolt-CEP (hyperbrew/bolt-cep)

**Pinned version: bolt-cep 2.2.3 / create-bolt-cep 2.2.3**, both published 2026-06-28
(npm registry `time` field, checked 2026-09-08). Repo:
[hyperbrew/bolt-cep](https://github.com/hyperbrew/bolt-cep) (the old `create-bolt-cep`
repo is archived; since v2.0.0 everything — template, `vite-cep-plugin`, create script —
lives in this monorepo).

**Scaffold** (interactive prompts choose framework, Adobe apps, sample-code keep/remove):

```
npx create-bolt-cep        # or: yarn create bolt-cep / pnpm create bolt-cep
```

Pick **React**, **AEFT only**. Prerequisite: **Node.js 18+** (use current LTS; Node 22.x
LTS is the safe choice in Sept 2026 and satisfies Vite 6).

**Stack (as of 2.2.x):** Vite 6, TypeScript 5, React 19 supported (all since 2.1.0,
2025-06-06, per [CHANGELOG](https://github.com/hyperbrew/bolt-cep/blob/master/CHANGELOG.md)).
All build/package settings live in `cep.config.ts` (typed `CEP_Config` from
`vite-cep-plugin`). Panel code in `src/js/main/`; ExtendScript written as modern TS in
`src/jsx/aeft/aeft.ts`, compiled to a single ES3 file; JSON2 bundled by default; external
ExtendScript pulled in with `// @include './lib/library.js'` — **this is the hook for the
Parallaxie core** (see §6).

**Notable `cep.config.ts` defaults** (verified against master, 2026-09-08):
`extensionManifestVersion: 6.0`, `requiredRuntimeVersion: 9.0`,
`parameters: ["--v=0", "--enable-nodejs", "--mixed-context"]`, `port: 3000`,
`servePort: 5000`, `startingDebugPort: 8860`, `symlink: "local"`, `type: "Panel"`, hosts
default to all apps with `version: "[0.0,99.9]"` — trim to
`{ name: "AEFT", version: "[22.0,99.9]" }`.

**evalTS typing:** functions exported from `src/jsx/aeft/aeft.ts` are callable from the
panel as `evalTS("fnName", ...args)` returning a `Promise`; argument and return types are
inferred end-to-end from the ExtendScript function signatures, and
stringification/parsing of arguments and results is automatic. Bolt namespaces the
compiled ExtendScript under the panel's ID to avoid global clashes. For code *outside*
that namespace — i.e. an existing global like `$.global.PXE` — use
`evalES(script, true)` (second arg = evaluate in global scope), or wrap the global in an
exported dispatcher function so it gains evalTS typing (§6).

**Dev-mode hot reload:** run `yarn build` once (creates a **symlink** from the CEP
extensions folder to `dist/cep`), then `yarn dev` — Vite HMR serves the panel at
`localhost:3000/main/`; both the JS and ExtendScript trees rebuild on change. Because dev
mode serves from localhost, ordinary Chrome DevTools work directly against it.
PlayerDebugMode must be on for `dev`/`build` output; only a signed installed ZXP
(`yarn zxp`) runs without it.

**Packaging:** `yarn zxp` builds and signs to `dist/zxp` (config block `zxp:` in
`cep.config.ts`); `yarn zip` bundles the ZXP plus `copyZipAssets` into `./zip`. A GitHub
Actions workflow for ZXP releases ships with the template.

**Breaking / notable changes 2025–2026** (from the changelog):

- **2.0.0 (2025-05-31), the major bump:** migration to "Meta Bolt" and monorepo
  consolidation; app selection at scaffold time; improved `evalTS()` error catching;
  zero-byte files removed from builds (an Adobe Exchange rejection cause). Projects
  scaffolded from 1.x differ structurally; start fresh on 2.2.3 rather than upgrading.
- 1.2.7–1.2.9 (April 2025): bundled **ZXPSignCmd updated on both platforms to fix the
  November 2024 timestamp/signature-validation issue** (§4). Do not build ZXPs with
  bolt < 1.2.9.
- 2.2.0 (2025-11-20): `zxpOutput`/`zipOutput` config paths. 2.2.3 (2026-06-28): CJS asset
  and Svelte path fixes only.

---

## 2. CEP runtime and manifest

**Latest CEP: 12** ([Adobe-CEP/CEP-Resources](https://github.com/Adobe-CEP/CEP-Resources),
`CEP_12.x`). Embeds **Chromium/CEF 99**, **Node.js 17.7.1**, NW 0.62.1, V8 9.9.115.
Community consensus (and Adobe's Nov 2024 extensibility post as reported) is that CEP 12
is the **final major CEP version** — maintenance and security fixes only from here; new
investment goes to UXP. (Exact wording of the Adobe post is paywalled/403 to automated
fetch; treat "last major version" as well-sourced but not quoted.)

**AE version → CEP runtime** (CEP 11.1 and CEP 12 cookbooks):

| After Effects | CEP runtime | Embedded browser / Node |
|---|---|---|
| 17.1.4+ | CEP 10 | Chromium 80 era |
| 18.4 – 24.x (2021–2024, incl. **22.0 = AE 2022**) | **CEP 11** | Chromium 88 / Node 15.13 |
| 25.0+ (AE 2025), 26.x (AE 2026, released 2026-01-21) | **CEP 12** | Chromium 99 / Node 17.7.1 |

**One manifest covers AE 22.0–2026.** `RequiredRuntime Name="CSXS" Version="9.0"` means
"CEP 9 or newer"; CEP 11 and CEP 12 hosts both load it. Keep bolt's default
`requiredRuntimeVersion: 9.0` — do **not** raise it to 11 or 12; there is no benefit and
it only narrows compatibility.

**Required manifest fields for an AE-only panel** (all generated by bolt from
`cep.config.ts` — listed here for review, not hand-authoring):

- `ExtensionManifest Version="6.0"` (attribute; 5.0+ acceptable per the CEP 12 cookbook)
- `ExtensionBundleId` (reverse-DNS, e.g. `com.parallaxie.panel`), `ExtensionBundleVersion`
- `Extension Id` + `Version` per panel
- `ExecutionEnvironment > HostList`: `<Host Name="AEFT" Version="[22.0,99.9]" />`
- `RequiredRuntimeList > RequiredRuntime Name="CSXS" Version="9.0"`
- `DispatchInfo`: `Resources > MainPath` (panel HTML), `CEFCommandLine` parameters,
  `Lifecycle > AutoVisible`, `UI > Type=Panel`, `Menu` (panel name in Window > Extensions),
  `Geometry` (Size/MinSize/MaxSize)

Note (CEP cookbook): AE does **not** support programmatic panel resize of HTML panels;
design the layout responsive within Geometry min/max.

---

## 3. CEP deprecation / UXP status (checked 2026-09-08)

- **UXP panels for After Effects still do not exist.** AE exposes scripting-only UXP APIs;
  no panel framework, no beta announced. Latest independent verification 2026-04-19
  ([pushREC UXP status note](https://github.com/pushREC/after-effects-sdk-kb/blob/main/scripting/UXP-STATUS-NOTE.md));
  searches on 2026-09-08 found **no newer Adobe announcement**. The brief's April 2026
  statement stands.
- **Premiere Pro**: UXP went GA in Premiere 2026 (beta since Dec 2024). Adobe has said CEP
  will eventually stop working in Premiere, horizon "several years", **no date**
  ([Hyper Brew, 2026-03-31](https://hyperbrew.co/blog/uxp-plugins-in-premiere-2026/);
  [Adobe developer blog, Dec 2025](https://blog.developer.adobe.com/en/publish/2025/12/uxp-arrives-in-premiere-a-new-era-for-plugin-development)).
- **After Effects**: no CEP deprecation announcement of any kind. Industry read (July
  2026): AE plugins "will remain CEP-based for a good while longer than Premiere's"
  ([filmit.io](https://filmit.io/blog/future-of-adobe-plugins-uxp-cep-ai)). A developer
  request for a CEP/UXP roadmap (2026-01-08) remains unanswered on Adobe Community.
- Implication for Parallaxie: unchanged from Brief §7 — CEP is the right panel tech for
  the AE 2022–2026 window; keep the core's logic in pure functions behind the JSON
  dispatcher as the UXP hedge.

---

## 4. ZXP packaging and signing

**Pinned tool: ZXPSignCmd 4.1.3** — latest in
[Adobe-CEP/CEP-Resources/ZXPSignCMD](https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD)
(folders 4.1.1 / 4.1.103 / 4.1.2 / 4.1.3; 4.1.3 ships Win32, x64 and macOS builds).
4.1.3 fixes the **November 2024 cross-platform signing issue** (ZXPs that signed
"successfully" produced invalid signatures, giving blank panels after install; documented
in [KnownIssue2024.md](https://github.com/Adobe-CEP/CEP-Resources/blob/master/ZXPSignCMD/KnownIssue2024.md)).
Bolt ≥ 1.2.9 bundles the fixed ZXPSignCmd on both platforms — with bolt 2.2.3 nothing to
do, but if signing manually, use 4.1.3, never an older copy.

**Self-signed cert workflow** (what `yarn zxp` automates from the `zxp:` config block —
country, province, org, password; the `.p12` is regenerated on each run):

```
ZXPSignCmd -selfSignedCert SE Stockholm Parallaxie parallaxie password cert.p12
ZXPSignCmd -sign dist/cep Parallaxie_vX.Y.Z.zxp cert.p12 password -tsa http://timestamp.digicert.com/
ZXPSignCmd -verify Parallaxie_vX.Y.Z.zxp
```

Timestamp (TSA) matters: without it the signature dies with the cert. Bolt's default TSAs:
`http://timestamp.digicert.com/` (Windows), `http://timestamp.apple.com/ts01` (macOS);
`allowSkipTSA: false` — keep it false.

**aescripts distribution:** aescripts sells and installs ZXPs; extensions distributed
through them are signed and timestamped; installation is via their **Manager App** or the
free [ZXP/UXP Installer](https://aescripts.com/zxp-installer/) (both handle CEP `.zxp` and
UXP `.ccx`). **A self-signed certificate is standard practice** for CEP ZXPs — no
CA-issued cert is required by Adobe's installers or by aescripts. Their licensing
framework supports ExtendScript and JS/CEP (Become-an-Author FAQ, cited in
`COMPETITIVE_ANALYSIS.md` §5). Caveat: aescripts FAQ pages sit behind Cloudflare (403 on
2026-09-08, same limit as the competitive analysis §0); the author-side ZXP submission
checklist should be confirmed with aescripts at submission time. Hygiene that is known to
matter: no zero-byte files (bolt strips them since 1.3.2), no `.DS_Store`/`__MACOSX`
inside the bundle.

---

## 5. Debugging

**PlayerDebugMode** — required for any unsigned extension (`yarn build` / `yarn dev`).
Because Parallaxie targets both CEP 11 and CEP 12 hosts, set **both** keys on dev
machines:

- Windows: `HKEY_CURRENT_USER\Software\Adobe\CSXS.11` and `...\CSXS.12` — String value
  `PlayerDebugMode` = `1`
- macOS: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` and
  `defaults write com.adobe.CSXS.12 PlayerDebugMode 1` (if it does not take effect,
  `killall cfprefsd` and restart AE)
- Shortcut: the aescripts ZXP Installer has Settings > Debug > Enable Debugging.

**Remote debugging** — a `.debug` file (XML) at the extension root maps Extension Id to a
per-host debug port (valid range 1024–65534):

```xml
<ExtensionList>
  <Extension Id="com.parallaxie.panel.main">
    <HostList><Host Name="AEFT" Port="8860"/></HostList>
  </Extension>
</ExtensionList>
```

Bolt generates this from `startingDebugPort: 8860`. With the panel open in AE, browse to
`http://localhost:8860` in a Chromium browser and click the inspectable page to get
DevTools. Caveat: the embedded CEF (Chromium 88 in CEP 11, 99 in CEP 12) is old; if a
current Chrome's DevTools frontend misbehaves against it, use the devtools page served by
the port itself, or do day-to-day debugging against `yarn dev`'s `localhost:3000` where
normal DevTools work natively. `console.log` from the panel appears in the remote
DevTools console, not anywhere in AE.

---

## 6. evalScript in practice

**Transport realities.** `CSInterface.evalScript(script, callback)` passes one string in
and one string out. There is **no documented hard payload limit**; community reports show
multi-MB payloads (a 7 MB JSON send is on record) succeeding — but ExtendScript's
`JSON.parse` is extremely slow at MB scale ([Adobe Community: "JSON.parse extremely slow
in ExtendScript"](https://community.adobe.com/t5/premiere-pro-discussions/json-parse-extremely-slow-in-extendscript/m-p/13534456)),
so the practical ceiling is performance, not size. Failures are opaque: any throw, syntax
error or unserializable result returns the literal string `"EvalScript error."`
(`EvalScript_ErrMessage` in CSInterface.js).

**Latency.** Per-call bridge overhead is small (single-digit ms); the cost that matters is
the ExtendScript work itself, which runs on **AE's main/UI thread** and competes with AE's
own redraw. Known platform asymmetry: on macOS `evalScript` behaves synchronously — the
ExtendScript completes before the calling JS context resumes
([CEP-Resources issue #163](https://github.com/Adobe-CEP/CEP-Resources/issues/163), open
since 2018) — so a slow `PXE` call freezes the panel on mac. The brief's plan to throttle
drag-driven calls to 10–15 Hz inside one undo group with a watchdog is correct; validate
the feel on macOS specifically, and never issue overlapping evalScript calls from a drag
(serialize: coalesce or drop events while one call is in flight).

**Standard pattern for calling a global (`$.global.PXE`) with a JSON round-trip:**

```ts
// panel side — double-stringify makes a safe ES3 string literal of the payload
const payload = JSON.stringify(JSON.stringify(request));
csi.evalScript("PXE.dispatch(" + payload + ")", (res: string) => {
  if (res === "EvalScript error.") { /* surface it; never swallow */ }
  const result = JSON.parse(res);   // PXE.dispatch returns a JSON string
});
```

```jsx
// ExtendScript side — sketch written before the dispatcher landed. The
// implemented dispatcher is PXE.call with request key "fn", not
// PXE.dispatch/"cmd" — see docs/API_DISPATCHER.md for the real contract.
PXE.dispatch = function (jsonStr) {
  try { var req = JSON.parse(jsonStr); /* route on req.cmd; return JSON string */ }
  catch (e) { return '{"ok":false,"error":' + PXE._q(String(e)) + '}'; }
};
```

Every entry point wraps in try/catch and returns JSON with `ok`/`error` — this is what
makes the `"EvalScript error."` black hole survivable, and it is the same dispatcher the
ScriptUI panel and the suite will use (Brief §7).

**In bolt specifically:** `evalTS()` only sees functions compiled into bolt's namespaced
`src/jsx` bundle. Two sane options for Parallaxie, in order of preference:

1. `// @include` the built Parallaxie core into bolt's jsx entry and export one typed
   wrapper `dispatch(req: PxeRequest): PxeResponse` that calls `$.global.PXE.dispatch` —
   full evalTS typing, one seam, and the shipped panel carries its own core (no separate
   `.jsx` install step for panel users).
2. `evalES("PXE.dispatch(...)", true)` against an externally loaded core — useful in dev,
   fragile in production (depends on the user having run the `.jsx` first).

**Large-data patterns** (band-mask export, per-plane pixel reports, batch results):

- Chunk long-running work into several small evalScript calls so CEP events can be
  scheduled between them (Adobe cookbook guidance) — this also keeps the macOS
  synchronous freeze short.
- For MB-scale transfers, hand off through a temp file: ExtendScript writes JSON/PNG to
  disk and returns the path; the panel reads it (Node `fs`). Faster than megabyte string
  parsing on the ExtendScript side, and it never hits quoting bugs.
- If embedding data in the script string, `encodeURIComponent`/base64 it to dodge
  quote-escaping — or use the double-stringify pattern above, which is sufficient for
  well-formed JSON.

---

## 7. Node context and CSInterface.js

**Node in CEP panels is still available and current**: CEP 12 embeds Node.js 17.7.1,
enabled per-extension by the `--enable-nodejs` CEF command-line parameter
(`--mixed-context` gives each frame its own Node globals; without it, iframes reach Node
through `cep_node`). Bolt enables both by default — keep them. Is Node *needed* for
Parallaxie? Not strictly (ExtendScript can do the file I/O), but Node is the practical
side of the temp-file handoff (§6) and of writing PNG band masks fast. Do not depend on
Node-17-only APIs: AE 2022–2024 hosts provide **Node 15.13** (CEP 11). Treat Node 15 as
the floor inside the panel.

**CSInterface.js to vendor: v12.0.0** — header `/** CSInterface - v12.0.0 */`, from
[`CEP_12.x/CSInterface.js`](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/CSInterface.js)
(verified 2026-09-08). It is backward compatible with CEP 11 hosts. Bolt already vendors
CSInterface through `vite-cep-plugin`; verify it is the v12 file rather than adding a
second copy — two CSInterface copies in one panel is a classic source of ghost bugs.

---

## 8. Pinned toolchain (for the scaffold)

| Thing | Pin | Source, date |
|---|---|---|
| bolt-cep / create-bolt-cep | **2.2.3** (published 2026-06-28) | npm registry, 2026-09-08 |
| Node.js (dev machine) | **22.x LTS** (bolt requires ≥18) | bolt README, 2026-09-08 |
| Frontend | React 19 + TypeScript 5 + Vite 6 | bolt CHANGELOG 2.1.0 |
| ExtensionManifest Version | **6.0** | bolt default; CEP 12 cookbook |
| RequiredRuntime CSXS | **9.0** (floor — do not raise) | bolt default |
| Host range | `AEFT [22.0,99.9]` | this doc §2 |
| Runtime targets | CEP 11 (AE 22–24) + CEP 12 (AE 25–26) | CEP cookbooks |
| CSInterface.js | **v12.0.0** (CEP_12.x) | CEP-Resources, 2026-09-08 |
| ZXPSignCmd | **4.1.3** (bundled by bolt ≥ 1.2.9) | CEP-Resources ZXPSignCMD |
| Debug keys | `CSXS.11` **and** `CSXS.12`, PlayerDebugMode=1 | CEP 12 cookbook; KnownIssue2024 |
| Debug port | 8860 (bolt `startingDebugPort`) | bolt default |

**Sources index (all accessed 2026-09-08):**
[bolt-cep repo](https://github.com/hyperbrew/bolt-cep) ·
[bolt CHANGELOG](https://github.com/hyperbrew/bolt-cep/blob/master/CHANGELOG.md) ·
[bolt cep.config.ts](https://github.com/hyperbrew/bolt-cep/blob/master/cep.config.ts) ·
[CEP 12 Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md) ·
[CEP 11.1 Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_11.x/Documentation/CEP%2011.1%20HTML%20Extension%20Cookbook.md) ·
[Adobe Tech Blog, 2024-11-12](https://medium.com/adobetech/updates-for-creative-cloud-desktop-extensibility-0dd5c663563e) ·
[Hyper Brew UXP/Premiere, 2026-03-31](https://hyperbrew.co/blog/uxp-plugins-in-premiere-2026/) ·
[Adobe dev blog: UXP in Premiere, Dec 2025](https://blog.developer.adobe.com/en/publish/2025/12/uxp-arrives-in-premiere-a-new-era-for-plugin-development) ·
[pushREC UXP status, verified 2026-04-19](https://github.com/pushREC/after-effects-sdk-kb/blob/main/scripting/UXP-STATUS-NOTE.md) ·
[filmit.io, July 2026](https://filmit.io/blog/future-of-adobe-plugins-uxp-cep-ai) ·
[ZXPSignCMD folder + KnownIssue2024](https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD) ·
[evalScript mac-sync issue #163](https://github.com/Adobe-CEP/CEP-Resources/issues/163) ·
[EvalScript error thread](https://community.adobe.com/t5/exchange-discussions/q-csinterface-evalscript-reports-quot-evalscript-error-quot/m-p/9903586) ·
[JSON.parse slow in ExtendScript](https://community.adobe.com/t5/premiere-pro-discussions/json-parse-extremely-slow-in-extendscript/m-p/13534456) ·
[aescripts ZXP Installer](https://aescripts.com/zxp-installer/)
