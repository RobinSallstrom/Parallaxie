/**
 * Mock PXE -- browser-only stand-in for the engine dispatcher.
 *
 * Selected automatically by the bridge when window.__adobe_cep__ is absent,
 * so `npm run dev` works in a plain browser with no After Effects.
 * Implements the same call(fn, args) contract as PXE.call (see
 * docs/API_DISPATCHER.md) over the 6-plane mock scene from
 * docs/PANEL_SPEC.md sec. 11, with 80-200 ms artificial latency.
 *
 * All numbers here are CANNED. The mock does not reproduce engine math
 * (the panel must never hand-compute bands or coverage); it returns
 * plausible, self-consistent fixtures so every UI state is reachable.
 */

import type { PXEFn, PXEResult, ScenePlane } from "../../types/pxe";
import { MOVE_TYPES } from "../../types/pxe";

// --- dev switches (surfaced in the shell's mock-mode dev strip) ------------

export type MockPreflightMode = "clean" | "warn" | "blocker";

export const mockDevControls = {
  preflightMode: "warn" as MockPreflightMode,
  /** Next mutation returns ok:false (tests error paths). Auto-resets. */
  forceNextError: false,
  /** Next call never resolves (tests the bridge timeout). Auto-resets. */
  forceNextTimeout: false,
};

// --- mock scene state (mutable so reconciliation paths run in-browser) -----

interface MockState {
  compName: string;
  width: number;
  height: number;
  far: number;
  rigged: boolean;
  moveKeys: number;
  currentMove: string;
  currentPct: number;
  planes: ScenePlane[];
  auditLayer: string | null;
}

const initialPlanes = (): ScenePlane[] => [
  { name: "01_FG_BRANCH", z: 0, scalePct: 100.0, stackIndex: 1, isFog: false },
  { name: "02_HERO", z: 600, scalePct: 118.2, stackIndex: 2, isFog: false },
  { name: "03_TREES", z: 1400, scalePct: 142.5, stackIndex: 3, isFog: false },
  { name: "PXE_FOG_01", z: 2000, scalePct: 160.7, stackIndex: 4, isFog: true },
  { name: "04_HILLS", z: 2400, scalePct: 172.9, stackIndex: 5, isFog: false },
  { name: "05_MOUNTAINS", z: 3600, scalePct: 209.3, stackIndex: 6, isFog: false },
  { name: "06_SKY_PLATE", z: 5000, scalePct: 251.8, stackIndex: 7, isFog: false },
];

const state: MockState = {
  compName: "HERO_SHOT_v3",
  width: 1920,
  height: 1080,
  far: 5000,
  rigged: true,
  moveKeys: 2,
  currentMove: "Push-In",
  currentPct: 5,
  planes: initialPlanes(),
  auditLayer: null,
};

// Canned coverage statuses per plane name (spec sec. 11: three cut-outs, a
// fog card and two plates clear, the zero-bleed sky plate tearing).
const CUTOUT_PLANES = ["01_FG_BRANCH", "02_HERO", "03_TREES"];
const FAILING_PLANE = "06_SKY_PLATE";
const FAILING_PX = 38;
const FIRST_FAILURE_PCT = 3.6;

// Canned per-cut band widths, near-to-far (7 planes = 6 cuts).
const CANNED_BAND_PX = [12, 10, 9, 7, 6, 38];

// --- helpers ----------------------------------------------------------------

const delay = () =>
  new Promise<void>((res) => setTimeout(res, 80 + Math.random() * 120));

const okResult = <T extends object>(
  lines: string[],
  typed?: T
): PXEResult<T & { text: string }> => {
  const text = lines.join("\n");
  const warnings = lines
    .slice(1)
    .map((l) => l.replace(/^\s+/, ""))
    .filter((l) => /^(WARN|BLOCKER)\b/.test(l));
  return {
    ok: true,
    msg: lines[0],
    warnings,
    data: { ...(typed as T), text } as T & { text: string },
  };
};

const errResult = (msg: string): PXEResult<never> => ({
  ok: false,
  msg,
  warnings: [],
  data: null,
});

const VALID_FNS =
  "addFog, adoptSelected, applyMove, auditOff, auditOn, bake, bands, build, " +
  "buildSelected, checkMove, clearMove, distribute, preflight, randomize, " +
  "reset, restackFog, setDepth, setDepths, status, version";

const sortedPlanes = () =>
  [...state.planes].sort((a, b) => a.stackIndex - b.stackIndex);

const isLateral = (move: string) =>
  move === "Drift L" || move === "Drift R" || move === "Rise" || move === "Sink";

// --- fn implementations -----------------------------------------------------

const fnVersion = () =>
  okResult(["Parallaxie v1.4 (mock bridge - no After Effects present)"], {
    version: "1.4-mock",
    far: state.far,
  });

const fnStatus = () => {
  const layers = sortedPlanes().map((p) => ({
    name: p.name,
    z: p.z,
    scale: p.scalePct,
  }));
  const lines = [
    "STATUS " +
      state.compName +
      " " +
      state.width +
      "x" +
      state.height +
      " cam=" +
      (state.rigged ? "yes" : "no") +
      " moveKeys=" +
      state.moveKeys,
    ...layers.map((l) => "  " + l.name + " z=" + l.z + " scale=" + l.scale),
  ];
  return okResult(lines, {
    comp: state.compName,
    width: state.width,
    height: state.height,
    cam: state.rigged,
    moveKeys: state.moveKeys,
    layers,
  });
};

const fnPreflight = () => {
  const mode = mockDevControls.preflightMode;
  if (mode === "clean") {
    return okResult([
      "OK: preflight clean - 6 NN_ layers, Classic 3D, no blockers",
    ]);
  }
  if (mode === "warn") {
    return okResult([
      "OK: preflight passed with warnings",
      "WARN NN_ numbering runs front-to-back (01 nearest); depth comes from stacking order, not the numbers",
      "WARN layer '03_TREES' has a 2D splitter above it; splitters break the 3D stack",
    ]);
  }
  return okResult([
    "PREFLIGHT: blocked",
    "BLOCKER 2 NN_ layer(s) hidden: 03_NEAR, 07_MIST - show them or they will NOT be rigged",
  ]);
};

const fnBuild = (args: Record<string, unknown>) => {
  const far = typeof args.far === "number" ? args.far : 5000;
  const order = typeof args.order === "string" ? args.order : "stack";
  state.far = far;
  state.rigged = true;
  const lines = [
    "OK: rigged " +
      state.planes.length +
      " layers (" +
      state.planes.length +
      " depth planes), far=" +
      far +
      ", order=" +
      order,
  ];
  if (mockDevControls.preflightMode !== "clean") {
    lines.push("WARN 1 NN_ layer(s) hidden and NOT rigged: 03_NEAR");
  }
  return okResult(lines);
};

const fnBuildSelected = (args: Record<string, unknown>) => {
  const far = typeof args.far === "number" ? args.far : 5000;
  state.far = far;
  state.rigged = true;
  return okResult([
    "OK: rigged " +
      state.planes.length +
      " layers (" +
      state.planes.length +
      " depth planes), far=" +
      far +
      ", order=stack",
    "NOTE renamed 2 layer(s) to the NN_ convention: castle -> 05_castle, sky -> 06_sky",
  ]);
};

let mockAdoptCount = 0;
const fnAdoptSelected = (args: Record<string, unknown>) => {
  if (!state.rigged)
    return errResult(
      "ERROR: no rig in this comp - run Build first, then adopt extra layers"
    );
  mockAdoptCount += 1;
  const z = typeof args.z === "number" ? args.z : 1000;
  const rank = state.planes.filter((p) => !p.isFog && p.z > z).length + 1;
  const name =
    String(rank).padStart(2, "0") +
    "_ADOPTED_" +
    String(mockAdoptCount).padStart(2, "0");
  const maxIndex = Math.max(...state.planes.map((p) => p.stackIndex));
  state.planes.push({
    name,
    z,
    scalePct: Math.round((100 + z * 0.0304) * 10) / 10,
    stackIndex: maxIndex + 1,
    isFog: false,
  });
  return okResult(["OK: adopted 1 layer(s): " + name + " (z=" + z + ")"]);
};

const findPlane = (name: string) => state.planes.find((p) => p.name === name);

const setPlaneZ = (plane: ScenePlane, z: number) => {
  plane.z = z;
  // Canned display-only scale (mock cosmetics, not engine math).
  plane.scalePct = Math.round((100 + z * 0.0304) * 10) / 10;
};

const fnSetDepth = (args: Record<string, unknown>) => {
  if (typeof args.layer !== "string")
    return errResult("ERROR: setDepth requires arg 'layer' (string)");
  if (typeof args.z !== "number")
    return errResult("ERROR: setDepth requires arg 'z' (number)");
  const plane = findPlane(args.layer);
  if (!plane)
    return errResult(
      "ERROR: layer '" + args.layer + "' is not rigged - run build first"
    );
  setPlaneZ(plane, args.z);
  return okResult(["OK: " + plane.name + " z=" + plane.z]);
};

const fnSetDepths = (args: Record<string, unknown>) => {
  const depths = args.depths;
  if (!depths || typeof depths !== "object" || Array.isArray(depths))
    return errResult("ERROR: setDepths requires arg 'depths' (object of layerName: z)");
  let n = 0;
  for (const [name, z] of Object.entries(depths as Record<string, unknown>)) {
    const plane = findPlane(name);
    if (plane && typeof z === "number") {
      setPlaneZ(plane, z);
      n++;
    }
  }
  return okResult(["OK: set depth on " + n + " layer(s)"]);
};

const fnDistribute = (args: Record<string, unknown>) => {
  const near = typeof args.near === "number" ? args.near : 0;
  const far = typeof args.far === "number" ? args.far : state.far;
  const bias = typeof args.bias === "number" ? args.bias : 1;
  const planes = sortedPlanes();
  const n = planes.length;
  planes.forEach((p, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    setPlaneZ(p, Math.round(near + (far - near) * Math.pow(t, bias)));
  });
  return okResult([
    "OK: distributed " + n + " planes " + near + ".." + far + " bias=" + bias,
  ]);
};

const fnRandomize = (args: Record<string, unknown>) => {
  const band = typeof args.band === "number" ? args.band : 200;
  state.planes.forEach((p) => {
    const jitter = Math.round((Math.random() - 0.5) * band);
    setPlaneZ(p, Math.max(0, p.z + jitter));
  });
  return okResult(["OK: randomized depths, band=" + band]);
};

const validateMove = (args: Record<string, unknown>, required: boolean) => {
  const move = typeof args.move === "string" ? args.move : required ? null : "Push-In";
  if (move === null)
    return { move: null, err: errResult("ERROR: applyMove requires arg 'move' (string)") };
  if ((MOVE_TYPES as readonly string[]).indexOf(move) === -1)
    return {
      move: null,
      err: errResult(
        "ERROR: unknown move '" + move + "'. Valid moves: " + MOVE_TYPES.join(", ")
      ),
    };
  return { move, err: null };
};

const fnCheckMove = (args: Record<string, unknown>) => {
  const { move, err } = validateMove(args, false);
  if (err || move === null) return err as PXEResult<never>;
  const pct = typeof args.pct === "number" ? args.pct : 5;
  const radial = !isLateral(move);
  const planes = sortedPlanes();
  const cutouts = planes.filter((p) => CUTOUT_PLANES.indexOf(p.name) !== -1).length;
  const failing =
    !radial && pct >= FIRST_FAILURE_PCT ? planes.find((p) => p.name === FAILING_PLANE) : undefined;
  const exposes = failing ? [{ name: failing.name, z: failing.z, px: FAILING_PX }] : [];
  const clear = exposes.length === 0;
  const lines = [
    "CHECK " + move + " " + pct + "%: " + (clear ? "CLEAR" : "1 plane EXPOSES"),
  ];
  if (radial && move === "Push-In") {
    lines.push("NOTE Push-In cannot fail coverage - margins grow toward camera");
  }
  exposes.forEach((e) =>
    lines.push("EXPOSES " + e.name + " z=" + e.z + " " + e.px + "px of empty canvas")
  );
  return okResult(lines, {
    move,
    strengthPct: pct,
    radial,
    zoom: radial ? 0.05 * pct * state.width : 0,
    riggedCount: planes.length,
    cutouts,
    clear,
    exposes,
    firstFailurePct: !radial ? FIRST_FAILURE_PCT : null,
    firstFailureLayer: !radial ? FAILING_PLANE : null,
  });
};

const fnBands = (args: Record<string, unknown>) => {
  const { move, err } = validateMove(args, false);
  if (err || move === null) return err as PXEResult<never>;
  const pct = typeof args.pct === "number" ? args.pct : 5;
  const radial = !isLateral(move);
  const planes = sortedPlanes();
  const cuts: import("../../types/pxe").BandCut[] = [];
  for (let i = 0; i < planes.length - 1; i++) {
    cuts.push({
      nearName: planes[i].name,
      farName: planes[i + 1].name,
      zNear: planes[i].z,
      zFar: planes[i + 1].z,
      bandPx: CANNED_BAND_PX[i] ?? 5,
    });
  }
  const totalPx = cuts.reduce((s, c) => s + c.bandPx, 0);
  const lines = [
    "BANDS " + move + " " + pct + "%: " + cuts.length + " cuts, total " + totalPx + "px",
    ...cuts.map(
      (c) =>
        "  " + c.nearName + " (z" + c.zNear + ") -> " + c.farName + " (z" + c.zFar + "): " + c.bandPx + "px"
    ),
  ];
  if (radial) {
    lines.push("NOTE radial move - bands expose on the centre-facing edges of each cut");
  }
  return okResult(lines, {
    move,
    strengthPct: pct,
    radial,
    zoom: radial ? 0.05 * pct * state.width : 0,
    dolly: radial ? 120 : 0,
    lateral: radial ? 0 : (pct / 100) * state.width,
    cuts,
    totalPx,
    totalPctOfWidth: Math.round((totalPx / state.width) * 1000) / 10,
  });
};

const fnApplyMove = (args: Record<string, unknown>) => {
  const { move, err } = validateMove(args, true);
  if (err || move === null) return err as PXEResult<never>;
  const pct = typeof args.pct === "number" ? args.pct : 5;
  const duration = typeof args.duration === "number" ? args.duration : 6;
  state.moveKeys = 2;
  state.currentMove = move;
  state.currentPct = pct;
  return okResult([
    "OK: applied " + move + " " + pct + "% over " + duration + "s (2 keys on PXE_CAM)",
  ]);
};

const fnClearMove = () => {
  state.moveKeys = 0;
  return okResult(["OK: cleared move keys from PXE_CAM"]);
};

const fnAddFog = (args: Record<string, unknown>) => {
  const z = typeof args.z === "number" ? args.z : 1800;
  const opacity = typeof args.opacity === "number" ? args.opacity : 12;
  const name = "PXE_FOG_" + String(state.planes.filter((p) => p.isFog).length + 1).padStart(2, "0");
  const maxIndex = Math.max(...state.planes.map((p) => p.stackIndex));
  state.planes.push({
    name,
    z,
    scalePct: Math.round((100 + z * 0.0304) * 10) / 10,
    stackIndex: maxIndex + 1,
    isFog: true,
  });
  return okResult(["OK: added " + name + " at z=" + z + ", opacity=" + opacity + "%"]);
};

const fnRestackFog = () => okResult(["OK: fog cards restacked by depth"]);

const fnAuditOn = (args: Record<string, unknown>) => {
  const layer =
    typeof args.layer === "string" ? args.layer : state.planes[0]?.name ?? "";
  if (!findPlane(layer))
    return errResult("ERROR: layer '" + layer + "' is not rigged - cannot audit");
  state.auditLayer = layer;
  return okResult(["OK: auditing " + layer + " at move extreme (soloed)"]);
};

const fnAuditOff = () => {
  state.auditLayer = null;
  return okResult(["OK: audit off - solo states restored"]);
};

const fnBake = () => {
  state.rigged = false;
  state.moveKeys = 0;
  return okResult(["OK: baked - rig stripped, result kept"]);
};

const fnReset = () => {
  state.rigged = false;
  state.moveKeys = 0;
  state.planes = initialPlanes();
  return okResult(["OK: reset - layers returned to flat 2D"]);
};

// --- dispatcher -------------------------------------------------------------

const MUTATING_FNS: PXEFn[] = [
  "build",
  "setDepth",
  "setDepths",
  "distribute",
  "randomize",
  "applyMove",
  "clearMove",
  "addFog",
  "restackFog",
  "auditOn",
  "auditOff",
  "bake",
  "reset",
];

/**
 * Same contract as the engine's PXE.call, minus the JSON string transport
 * (the bridge round-trips through JSON.stringify/parse to keep parity).
 */
export async function mockCall(
  fn: string,
  args: Record<string, unknown>
): Promise<PXEResult<Record<string, unknown>>> {
  if (mockDevControls.forceNextTimeout) {
    mockDevControls.forceNextTimeout = false;
    return new Promise(() => {
      /* never resolves; the bridge timeout fires */
    });
  }
  await delay();
  if (
    mockDevControls.forceNextError &&
    MUTATING_FNS.indexOf(fn as PXEFn) !== -1
  ) {
    mockDevControls.forceNextError = false;
    return errResult("ERROR: forced mock failure (dev switch) for fn '" + fn + "'");
  }
  switch (fn as PXEFn) {
    case "version":
      return fnVersion();
    case "status":
      return fnStatus();
    case "preflight":
      return fnPreflight();
    case "build":
      return fnBuild(args);
    case "buildSelected":
      return fnBuildSelected(args);
    case "adoptSelected":
      return fnAdoptSelected(args);
    case "setDepth":
      return fnSetDepth(args);
    case "setDepths":
      return fnSetDepths(args);
    case "distribute":
      return fnDistribute(args);
    case "randomize":
      return fnRandomize(args);
    case "checkMove":
      return fnCheckMove(args);
    case "bands":
      return fnBands(args);
    case "applyMove":
      return fnApplyMove(args);
    case "clearMove":
      return fnClearMove();
    case "addFog":
      return fnAddFog(args);
    case "restackFog":
      return fnRestackFog();
    case "auditOn":
      return fnAuditOn(args);
    case "auditOff":
      return fnAuditOff();
    case "bake":
      return fnBake();
    case "reset":
      return fnReset();
    default:
      return errResult("ERROR: unknown fn '" + fn + "'. Valid fns: " + VALID_FNS);
  }
}
