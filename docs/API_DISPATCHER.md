# PXE.call — the structured-result JSON dispatcher

*Added 2026-09-08 against Parallaxie v1.2, implementing the roadmap Phase 1 item
"Return structured results through a `PXE.call(json)` dispatcher" and
`ARCHITECTURE_REVIEW.md` §6.2. The string-returning `PXE.*` functions are unchanged;
the dispatcher is a shim over them, so the existing suite semantics hold during
migration. Everything below is implemented in `Parallaxie_v1.jsx` unless it is
explicitly marked planned.*

## Calling it

```javascript
// after evaluating Parallaxie_v1.jsx (headless or panel - PXE.call exists either way)
var responseJson = PXE.call('{"fn":"checkMove","args":{"move":"Drift L","pct":10}}');
```

`PXE.call` takes one JSON **string** and returns one JSON **string**. It never
throws: any failure — malformed JSON, unknown `fn`, missing required args, an
exception inside the engine — comes back as an `ok:false` response.

## Request shape

```json
{ "fn": "checkMove", "args": { "move": "Drift L", "pct": 10 } }
```

- `fn` (string, required): one of the function names in the table below.
  Unknown or missing `fn` returns `ok:false` with a message that names the bad
  value and lists every valid `fn`.
- `args` (object, optional): named arguments per the table. Omitted or
  non-object `args` is treated as `{}`; every function applies the same
  defaults the string API applies. Unknown keys are ignored.

Note: review §6.2 sketched the key as `"cmd"`. The implemented key is `"fn"`,
per the roadmap task wording. There is no alias.

## Response shape

```json
{ "ok": true, "msg": "OK: rigged 5 layers (5 depth planes), far=5000, order=stack",
  "warnings": ["WARN 1 NN_ layer(s) hidden and NOT rigged: 03_NEAR"],
  "data": { "text": "OK: rigged 5 layers (...)\nWARN 1 NN_ layer(s) ..." } }
```

- `ok` (bool): `false` only when the call could not run — engine returned an
  `ERROR:` result, no active comp, malformed request, unknown `fn`, missing
  required args, or an exception. **`ok:true` does not mean the scene is
  clean**: preflight `BLOCKER`s and build `WARN`s arrive in `warnings` with
  `ok:true`, because the call itself succeeded. UIs must render `warnings`.
- `msg` (string): the first line of the underlying result — the human summary.
- `warnings` (array of strings): every subsequent line of the result whose
  first non-space token is `WARN` or `BLOCKER`, leading whitespace stripped.
  Other informational lines (`NOTE`, `INFO`, per-cut band rows, `EXPOSES`
  rows) are *not* duplicated here; they are in `data.text` and, where
  structured, in typed `data` fields.
- `data` (object or null): `null` whenever `ok:false`. When `ok:true` it is
  always an object and always carries `data.text`, the complete multi-line raw
  string the wrapped function returned (so nothing the string API says is ever
  lost). `checkMove`, `bands`, `status` and `version` add typed fields on top —
  see the table.

The encoder output is ASCII-safe: any character outside `0x20..0x7E` is
emitted as a `\uXXXX` escape, so the response survives every transport.

## Error semantics, exactly

| Input | Response |
| --- | --- |
| Malformed JSON (`'{"fn": broken'`) | `ok:false`, `msg` starts `ERROR: JSON parse error at <pos>: ...` |
| JSON but not an object (`'[1,2]'`, `'"x"'`) | `ok:false`, `msg` says the request must be a JSON object |
| Unknown / missing `fn` | `ok:false`, `msg`: `ERROR: unknown fn '<fn>'. Valid fns: addFog, adoptSelected, applyMove, auditOff, auditOn, bake, bands, build, buildSelected, checkMove, clearMove, distribute, preflight, randomize, reset, restackFog, setDepth, setDepths, status, version` |
| Missing required args (`setDepth`, `setDepths`, `applyMove`) | `ok:false`, `msg` names the missing arg and its type |
| Engine says `ERROR: ...` (e.g. no active comp, unrigged layer) | `ok:false`, `msg` is that error line, `data:null` |
| `status` with no active comp | `ok:false`, `msg: "no active comp"` (the one engine error that does not start with `ERROR`) |
| Exception anywhere in dispatch | `ok:false`, `msg: "ERROR: " + exception text` |

`PXE.call` returns a string in every one of these cases; it never raises.

## The fn table

Args marked *(opt)* fall back to the same defaults as the string API.
`data` lists the typed fields **in addition to** the ever-present `data.text`.

| `fn` | Routes to | `args` | Typed `data` fields |
| --- | --- | --- | --- |
| `preflight` | `PXE.preflight()` | — | — (findings land in `warnings`; full report in `data.text`) |
| `build` | `PXE.buildFromComp(far, opts)` | `far` num *(opt)*, `order` `"stack"`\|`"name-asc"`\|`"name-desc"` *(opt)*, `allowHidden` bool *(opt)* | — |
| `buildSelected` | `PXE.buildFromSelection(far)` | `far` num *(opt)* | — (renames land as `NOTE` lines in `data.text`) |
| `adoptSelected` | `PXE.adoptSelected(z)` | `z` num *(opt: inherited per layer from the plane below in the stack)* | — |
| `status` | `PXE.status()` internals | — | `comp` str, `width` num, `height` num, `cam` bool, `moveKeys` num, `layers` [{`name`, `z`, `scale`}] (z and scale unrounded) |
| `setDepth` | `PXE.setDepth(layer, z)` | `layer` str **(required)**, `z` num **(required)** | — |
| `setDepths` | `PXE.setDepths(map)` | `depths` object `{layerName: z, ...}` **(required)** | — |
| `distribute` | `PXE.distribute(near, far, bias)` | `near` num *(opt, 0)*, `far` num *(opt, PXE.far)*, `bias` num *(opt, 1)* | — |
| `randomize` | `PXE.randomize(band)` | `band` num *(opt, 200)* | — |
| `bands` | `PXE.bands(move, pct)` internals | `move` str *(opt, "Push-In")*, `pct` num *(opt, 5)* | `move` str, `strengthPct` num, `radial` bool, `zoom` num (px), `dolly` num, `lateral` num, `cuts` [{`nearName`, `farName`, `zNear`, `zFar`, `bandPx`}], `totalPx` num, `totalPctOfWidth` num (all unrounded) |
| `checkMove` | `PXE.checkMove(move, pct)` internals | `move` str *(opt, "Push-In")*, `pct` num *(opt, 5)* | `move` str, `strengthPct` num, `radial` bool, `zoom` num, `riggedCount` num, `cutouts` num, `clear` bool, `exposes` [{`name`, `z`, `px`}], `firstFailurePct` num\|null, `firstFailureLayer` str\|null |
| `applyMove` | `PXE.applyMove(move, sec, pct)` | `move` str **(required)**: `"Push-In"` `"Pull-Back"` `"Drift L"` `"Drift R"` `"Rise"` `"Sink"`, `duration` num sec *(opt, comp duration)*, `pct` num *(opt, 5)* | — |
| `clearMove` | `PXE.clearMove()` | — | — |
| `addFog` | `PXE.addFogCard(z, opacity, color)` | `z` num *(opt, meanDepth/2)*, `opacity` num % *(opt, 12)*, `color` [r,g,b] 0..1 *(opt)* | — (card name is in `msg`) |
| `restackFog` | `PXE.restackFog()` | — | — |
| `auditOn` | `PXE.auditOn(layer)` | `layer` str *(opt: falls back to the selected layer)* | — |
| `auditOff` | `PXE.auditOff()` | — | — |
| `bake` | `PXE.bake()` | — | — |
| `reset` | `PXE.reset()` | — | — |
| `version` | — (answered directly) | — | `version` str, `far` num (current `PXE.far`) |

## JSON in ES3

ExtendScript has no native `JSON` object, so `Parallaxie_v1.jsx` carries its
own encoder and a recursive-descent parser (no `eval` anywhere, on any input).
Both are exposed for ExtendScript-side callers and the test suite:

```javascript
PXE.json.encode(value)   // -> ASCII-safe JSON string; NaN/Infinity -> null,
                         //    functions/undefined skipped in objects
PXE.json.parse(string)   // -> value; THROWS on invalid JSON (PXE.call catches
                         //    this for you - only raw PXE.json.parse throws)
```

A CEP/browser host has native `JSON` and should just use it on the strings
`PXE.call` returns; the formats are interoperable (verified against node's
`JSON` implementation).

## Known limits (unchanged engine behaviour, documented, not new)

- Every call operates on `app.project.activeItem`, with all the S2 #19 caveats
  in `ARCHITECTURE_REVIEW.md`. An explicit `comp` argument on every call is a
  **planned** Phase 1 item, not implemented here; a bridge must not assume two
  consecutive calls hit the same comp if panel focus can move between them.
- Layer references are by display name (S2 #16). `layer.id` addressing is
  **planned**, not implemented.
- `ok`/`warnings` are derived from the wrapped functions' strings (first line +
  `WARN`/`BLOCKER`-flagged lines). This is the pragmatic first pass the roadmap
  asked for; if a wrapped function's string format changes, the split follows it.
- The dispatcher adds no new undo groups; each wrapped function keeps its own
  undo behaviour, including the S1 #7 gaps.

## Suite coverage

`PXE_SmokeTest.jsx` TEST 10 (checks 10.1–10.5) covers: valid round-trip
(`version`), unknown `fn`, malformed JSON never throwing, `checkMove` typed
data, and `status` typed data. That took the suite from 49 to **54** checks;
TEST 11 (selection build + adopt, v1.3) and TEST 12 (non-100% base scale /
defect #1, v1.4) TEST 13 (zero rig error at deep scale) and TEST 14 (keyed transforms refused, defect #3) take it to **74**, all executed headless and passing on
2026-09-10, including a SCALED FRAME-0 md5 lock (`f_scaled_flat == f_scaled_built`).
