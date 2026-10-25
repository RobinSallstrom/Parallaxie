/**
 * The evalScript bridge -- the panel's single seam to the engine.
 *
 * Components never call csInterface.evalScript directly and never parse
 * engine strings themselves (PANEL_SPEC.md sec. 10). Everything goes through
 * pxeCall(fn, args), which:
 *
 *   - JSON-round-trips through ExtendScript to PXE.call (docs/API_DISPATCHER.md)
 *     when running inside CEP,
 *   - serves the same contract from the mock (./mock.ts) when
 *     window.__adobe_cep__ is absent (plain-browser dev),
 *   - serialises all evalScript traffic: one call in flight per channel
 *     (command = FIFO, drag = latest-wins),
 *   - appends every result to the console subscribers (single choke point:
 *     engine defect #9 -- dropped warnings -- cannot recur in a component),
 *   - never rejects for engine-level failures; failures resolve as
 *     {ok:false, ...} so components handle one shape.
 *
 * Drag protocol (PANEL_SPEC.md sec. 10.3): beginDepthDrag() throttles engine
 * writes to ~12 Hz, opens one undo group at drag start, and guarantees the
 * group closes via a 2000 ms watchdog + window-blur handler.
 */

import { evalTS } from "../utils/bolt";
import type {
  ConsoleEntry,
  PXEFn,
  PXEResult,
  SceneModel,
  StatusData,
  VersionData,
} from "../../types/pxe";
import { mockCall } from "./mock";

// ---------------------------------------------------------------------------
// Host detection
// ---------------------------------------------------------------------------

export const isCEPHost = (): boolean =>
  typeof window !== "undefined" && !!window.__adobe_cep__;

// ---------------------------------------------------------------------------
// Engine location (dev only)
// ---------------------------------------------------------------------------

/**
 * TODO(release): the release build must concatenate Parallaxie_v1.jsx into
 * the compiled src/jsx bundle (bolt's `// @include` hook, see
 * docs/CEP_NOTES.md sec. 6) so the shipped panel carries its own core and
 * this path is never used. Until then, dev loads the existing engine file
 * from the repo by absolute path -- a dev-machine convenience only, and the
 * one knowingly platform-specific string in the panel. Override without
 * rebuilding via localStorage key "pxe.enginePath" in the panel's DevTools.
 */
const DEV_ENGINE_PATH = "C:/Users/Resolution Games/Documents/Projects/Parallaxie/Parallaxie_v1.jsx";

const enginePath = (): string => {
  try {
    return window.localStorage?.getItem("pxe.enginePath") || DEV_ENGINE_PATH;
  } catch {
    return DEV_ENGINE_PATH;
  }
};

// ---------------------------------------------------------------------------
// Console feed (single choke point for engine output)
// ---------------------------------------------------------------------------

type ConsoleListener = (entry: ConsoleEntry) => void;
const consoleListeners = new Set<ConsoleListener>();
let entryId = 0;

export const onConsoleEntry = (cb: ConsoleListener): (() => void) => {
  consoleListeners.add(cb);
  return () => consoleListeners.delete(cb);
};

const timeStamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
};

const emitEntry = (fn: string, res: PXEResult<unknown>) => {
  const entry: ConsoleEntry = {
    id: ++entryId,
    time: timeStamp(),
    fn,
    ok: res.ok,
    msg: res.msg,
    warnings: res.warnings,
    text: (res.data as { text?: string } | null)?.text ?? res.msg,
  };
  consoleListeners.forEach((cb) => cb(entry));
};

// ---------------------------------------------------------------------------
// Channels: one call in flight at a time
// ---------------------------------------------------------------------------

class Channel {
  private tail: Promise<unknown> = Promise.resolve();

  /** FIFO: append to the chain; one task in flight at a time. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    // Keep the chain alive regardless of task outcome.
    this.tail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}

const commandChannel = new Channel();
const dragChannel = new Channel();

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const COMMAND_TIMEOUT_MS = 10000;

const errResult = (msg: string): PXEResult<never> => ({
  ok: false,
  msg,
  warnings: [],
  data: null,
});

const withTimeout = <T>(
  p: Promise<T>,
  ms: number,
  onTimeout: () => T
): Promise<T> =>
  new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(onTimeout());
      }
    }, ms);
    p.then(
      (v) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      (e) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(onTimeout());
        }
        void e;
      }
    );
  });

/** Coerce whatever came back over the wire into a well-formed PXEResult. */
const normalize = (raw: unknown, fn: string): PXEResult<Record<string, unknown>> => {
  if (!raw || typeof raw !== "object")
    return errResult("ERROR: malformed response from engine for '" + fn + "'");
  const o = raw as Record<string, unknown>;
  const ok = o.ok === true;
  return {
    ok,
    msg: typeof o.msg === "string" ? o.msg : ok ? "" : "ERROR: unknown failure",
    warnings: Array.isArray(o.warnings)
      ? (o.warnings as unknown[]).filter((w): w is string => typeof w === "string")
      : [],
    data:
      ok && o.data && typeof o.data === "object"
        ? (o.data as Record<string, unknown> & { text: string })
        : null,
  };
};

let engineReady = false;

/** Load the engine into ExtendScript once (dev path; see DEV_ENGINE_PATH). */
const ensureEngine = async (): Promise<PXEResult<never> | null> => {
  if (engineReady) return null;
  try {
    const res = await evalTS("pxeEnsureEngine", enginePath());
    if (res && res.indexOf("OK") === 0) {
      engineReady = true;
      return null;
    }
    return errResult(
      (res || "ERROR: engine load failed") +
        " - set localStorage 'pxe.enginePath' to Parallaxie_v1.jsx and reload"
    );
  } catch (e) {
    return errResult("ERROR: engine load failed - " + String(e));
  }
};

const cepTransport = async (
  fn: PXEFn,
  args: Record<string, unknown>
): Promise<PXEResult<Record<string, unknown>>> => {
  const loadErr = await ensureEngine();
  if (loadErr) return loadErr;
  const request = JSON.stringify({ fn, args });
  try {
    const raw = await evalTS("pxeCallRaw", request);
    if (typeof raw !== "string" || raw === "EvalScript error.") {
      return errResult(
        "ERROR: evalScript failed for '" +
          fn +
          "' - After Effects returned 'EvalScript error.'"
      );
    }
    return normalize(JSON.parse(raw), fn);
  } catch (e) {
    return errResult("ERROR: bridge failure for '" + fn + "' - " + String(e));
  }
};

const transport = (
  fn: PXEFn,
  args: Record<string, unknown>
): Promise<PXEResult<Record<string, unknown>>> =>
  isCEPHost() ? cepTransport(fn, args) : mockCall(fn, args);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PxeCallOptions {
  /** "command" (default, FIFO) or "drag" (the interactive channel). */
  channel?: "command" | "drag";
  /** Skip the console feed (used for silent scene refreshes). */
  silent?: boolean;
}

/**
 * Call an engine fn. Resolves with {ok, msg, warnings, data}; never rejects
 * for engine-level failures. Times out after 10 s with an ok:false result.
 */
export const pxeCall = <T = Record<string, unknown>>(
  fn: PXEFn,
  args: Record<string, unknown> = {},
  opts: PxeCallOptions = {}
): Promise<PXEResult<T>> => {
  const channel = opts.channel === "drag" ? dragChannel : commandChannel;
  return channel.run(async () => {
    const res = await withTimeout(
      transport(fn, args),
      COMMAND_TIMEOUT_MS,
      () =>
        errResult(
          "ERROR: panel timeout waiting for '" +
            fn +
            "' - After Effects may be busy"
        ) as PXEResult<Record<string, unknown>>
    );
    if (!opts.silent) emitEntry(fn, res);
    return res as PXEResult<T>;
  });
};

// ---------------------------------------------------------------------------
// Undo-group helpers (drag protocol)
// ---------------------------------------------------------------------------

const beginUndoGroup = async (label: string): Promise<void> => {
  if (!isCEPHost()) return; // mock: no undo system
  try {
    await evalTS("pxeBeginUndoGroup", label);
  } catch (e) {
    emitEntry("undo.begin", errResult("ERROR: could not open undo group - " + String(e)));
  }
};

const endUndoGroup = async (): Promise<void> => {
  if (!isCEPHost()) return;
  try {
    await evalTS("pxeEndUndoGroup");
  } catch (e) {
    emitEntry("undo.end", errResult("ERROR: could not close undo group - " + String(e)));
  }
};

// ---------------------------------------------------------------------------
// Drag helper: ~12 Hz throttle, one undo group, watchdog close
// ---------------------------------------------------------------------------

/** 12 Hz. Spec range is 10-15 Hz (66-100 ms); see PANEL_SPEC.md 10.3. */
const DRAG_INTERVAL_MS = 83;
const WATCHDOG_MS = 2000;

export interface DepthDragHandle {
  /**
   * Feed the live pointer value. The UI should update optimistically every
   * frame; this throttles engine writes to ~12 Hz, latest value wins.
   */
  update(z: number): void;
  /**
   * End the gesture: send the final value, close the undo group (exactly
   * once, guaranteed), resolve with the final setDepth result. Safe to call
   * more than once; later calls resolve null.
   */
  commit(finalZ?: number): Promise<PXEResult | null>;
  /** True until commit (or the watchdog) has closed the gesture. */
  isOpen(): boolean;
}

/**
 * Open a depth-drag gesture for one layer.
 *
 * Undo contract: the group opens here, BEFORE the first mutation, and is
 * closed exactly once by commit() -- which the watchdog calls with the last
 * value if pointer events stop for 2 s or the window blurs, so a lost
 * mouseup can never leave AE swallowing later actions into one group.
 *
 * Interim protocol note: the v1.2 dispatcher has no phased depth command
 * ({"cmd":"depth.set", phase:...} is a spec requirement on a future
 * dispatcher revision), so the group is opened/closed by panel-owned
 * ExtendScript helpers (src/jsx/aeft/aeft.ts) around plain setDepth calls.
 * The engine's own undo debts (#7) are unchanged underneath.
 */
export const beginDepthDrag = (layerName: string): DepthDragHandle => {
  let open = true;
  let lastZ: number | null = null;
  let lastSendAt = 0;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pendingWhileInFlight = false;

  // Open the group first; the drag channel is FIFO so this lands before
  // any setDepth issued below.
  void dragChannel.run(() => beginUndoGroup("Parallaxie Depth Drag"));

  const clearTimers = () => {
    if (sendTimer) clearTimeout(sendTimer);
    if (watchdog) clearTimeout(watchdog);
    sendTimer = null;
    watchdog = null;
  };

  const onBlur = () => {
    void commit();
  };
  window.addEventListener("blur", onBlur);

  const armWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      void commit();
    }, WATCHDOG_MS);
  };

  const sendLatest = () => {
    if (!open || lastZ === null) return;
    if (inFlight) {
      // Latest-wins: remember that a newer value exists; send it when the
      // in-flight call resolves. Intermediates are dropped.
      pendingWhileInFlight = true;
      return;
    }
    const z = lastZ;
    inFlight = true;
    lastSendAt = Date.now();
    void pxeCall("setDepth", { layer: layerName, z }, { channel: "drag", silent: true }).then(
      () => {
        inFlight = false;
        if (open && pendingWhileInFlight) {
          pendingWhileInFlight = false;
          scheduleSend();
        }
      }
    );
  };

  const scheduleSend = () => {
    if (!open) return;
    const elapsed = Date.now() - lastSendAt;
    if (elapsed >= DRAG_INTERVAL_MS) {
      sendLatest();
    } else if (!sendTimer) {
      sendTimer = setTimeout(() => {
        sendTimer = null;
        sendLatest();
      }, DRAG_INTERVAL_MS - elapsed);
    }
  };

  const commit = async (finalZ?: number): Promise<PXEResult | null> => {
    if (!open) return null;
    open = false;
    clearTimers();
    window.removeEventListener("blur", onBlur);
    const z = typeof finalZ === "number" ? finalZ : lastZ;
    let result: PXEResult | null = null;
    try {
      if (z !== null) {
        result = (await pxeCall(
          "setDepth",
          { layer: layerName, z },
          { channel: "drag" }
        )) as PXEResult;
      }
    } finally {
      // The group closes exactly once, whatever happened above.
      await dragChannel.run(() => endUndoGroup());
    }
    return result;
  };

  return {
    update(z: number) {
      if (!open) return;
      lastZ = z;
      armWatchdog();
      scheduleSend();
    },
    commit,
    isOpen: () => open,
  };
};

// ---------------------------------------------------------------------------
// Scene refresh
// ---------------------------------------------------------------------------

let cachedFar = 5000;

/**
 * One status round-trip -> SceneModel, or null when there is no active comp
 * (the status error is still emitted to the console unless silent).
 */
export const refreshScene = async (
  opts: { silent?: boolean } = {}
): Promise<SceneModel | null> => {
  const silent = opts.silent !== false; // default: silent refresh
  const ver = await pxeCall<VersionData>("version", {}, { silent: true });
  if (ver.ok && ver.data && typeof ver.data.far === "number") {
    cachedFar = ver.data.far;
  }
  const res = await pxeCall<StatusData>("status", {}, { silent });
  if (!res.ok || !res.data) return null;
  const d = res.data;
  return {
    compName: d.comp,
    width: d.width,
    height: d.height,
    far: cachedFar,
    rigged: d.cam,
    moveKeys: d.moveKeys,
    planes: (d.layers || []).map((l, i) => ({
      name: l.name,
      z: l.z,
      scalePct: l.scale,
      stackIndex: i + 1,
      isFog: l.name.indexOf("PXE_FOG") === 0,
    })),
  };
};
