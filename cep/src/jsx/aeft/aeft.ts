/**
 * Panel-side ExtendScript shim. This file must NOT duplicate the engine:
 * all scene logic lives in Parallaxie_v1.jsx ($.global.PXE), which is
 * loaded -- never re-implemented -- here.
 *
 * TODO(release): the release build will concatenate the engine into this
 * bundle via bolt's `// @include` hook (docs/CEP_NOTES.md sec. 6) so the
 * shipped ZXP carries its own core. For dev, pxeEnsureEngine $.evalFile()s
 * the existing repo file by the path the panel passes in
 * (src/js/lib/pxe/bridge.ts DEV_ENGINE_PATH / localStorage override).
 *
 * Rules honoured here (CLAUDE.md): no alert()/confirm(), ASCII only,
 * no display-name property lookups (nothing here touches properties at all).
 */

type PXEGlobal = {
  call: (json: string) => string;
};

const getPXE = (): PXEGlobal | null => {
  const g = $.global as { PXE?: PXEGlobal };
  return g.PXE && typeof g.PXE.call === "function" ? g.PXE : null;
};

/**
 * Make sure $.global.PXE exists, loading the engine file if needed.
 * Returns "OK: ..." or "ERROR: ..." (plain string, never throws).
 */
export const pxeEnsureEngine = (enginePath: string): string => {
  try {
    if (getPXE()) return "OK: engine already loaded";
    const f = new File(enginePath);
    if (!f.exists) {
      return "ERROR: engine file not found at " + enginePath;
    }
    $.evalFile(f);
    if (getPXE()) return "OK: engine loaded from " + enginePath;
    return "ERROR: evaluated " + enginePath + " but $.global.PXE.call is missing";
  } catch (e) {
    return "ERROR: engine load threw - " + String(e);
  }
};

/**
 * The one seam: forward a JSON request string to PXE.call and return its
 * JSON response string untouched. PXE.call never throws by contract
 * (docs/API_DISPATCHER.md); the catch below covers a missing engine only.
 */
export const pxeCallRaw = (requestJson: string): string => {
  const pxe = getPXE();
  if (!pxe) {
    return '{"ok":false,"msg":"ERROR: engine not loaded - call pxeEnsureEngine first","warnings":[],"data":null}';
  }
  try {
    return pxe.call(requestJson);
  } catch (e) {
    return (
      '{"ok":false,"msg":"ERROR: PXE.call threw - ' +
      String(e).replace(/\\/g, "\\\\").replace(/"/g, '\\"') +
      '","warnings":[],"data":null}'
    );
  }
};

/**
 * Undo-group helpers for the panel's drag protocol (PANEL_SPEC.md 10.3):
 * the group opens before the first mutation and the panel-side watchdog
 * guarantees pxeEndUndoGroup is always sent. Kept as two tiny entry points
 * (ExtendScript has no reliable timer, so pairing lives panel-side).
 * The engine's own undo behaviour underneath is unchanged (debt #7).
 */
export const pxeBeginUndoGroup = (label: string): string => {
  try {
    app.beginUndoGroup(label || "Parallaxie Edit");
    return "OK: undo group open";
  } catch (e) {
    return "ERROR: beginUndoGroup threw - " + String(e);
  }
};

export const pxeEndUndoGroup = (): string => {
  try {
    app.endUndoGroup();
    return "OK: undo group closed";
  } catch (e) {
    return "ERROR: endUndoGroup threw - " + String(e);
  }
};
