/**
 * Panel-side contract types for the Parallaxie engine dispatcher.
 *
 * The engine side is PXE.call(jsonString) -> jsonString, documented in
 * docs/API_DISPATCHER.md (repo root). The envelope {ok, msg, warnings, data}
 * is fixed by ARCHITECTURE_REVIEW.md sec. 6.2; the TypeScript shapes below
 * mirror docs/PANEL_SPEC.md sec. 11.
 */

/** Every fn the v1.2 dispatcher accepts (exact strings). */
export type PXEFn =
  | "preflight"
  | "build"
  | "buildSelected"
  | "adoptSelected"
  | "status"
  | "setDepth"
  | "setDepths"
  | "distribute"
  | "randomize"
  | "bands"
  | "checkMove"
  | "applyMove"
  | "clearMove"
  | "addFog"
  | "restackFog"
  | "auditOn"
  | "auditOff"
  | "bake"
  | "reset"
  | "version";

/** The six exact move strings the engine accepts. */
export const MOVE_TYPES = [
  "Push-In",
  "Pull-Back",
  "Drift L",
  "Drift R",
  "Rise",
  "Sink",
] as const;
export type MoveType = (typeof MOVE_TYPES)[number];

export const DEPTH_ORDERS = ["stack", "name-asc", "name-desc"] as const;
export type DepthOrder = (typeof DEPTH_ORDERS)[number];

/**
 * The dispatcher envelope. ok:false only when the call could not run.
 * BLOCKER/WARN findings arrive in warnings[] WITH ok:true -- the UI must
 * render warnings (engine defect #9 is the panel throwing them away).
 * data is null iff ok:false; when ok:true, data.text always carries the
 * complete raw multi-line string of the wrapped engine function.
 */
export interface PXEResult<T = PXEData> {
  ok: boolean;
  msg: string;
  warnings: string[];
  data: (T & PXEData) | null;
}

/** Always present on ok:true responses. */
export interface PXEData {
  text: string;
}

/** Typed data for fn "status". */
export interface StatusData {
  comp: string;
  width: number;
  height: number;
  cam: boolean;
  moveKeys: number;
  layers: { name: string; z: number; scale: number }[];
}

/** Typed data for fn "version". */
export interface VersionData {
  version: string;
  far: number;
}

/** Typed data for fn "checkMove". */
export interface CheckMoveData {
  move: string;
  strengthPct: number;
  radial: boolean;
  zoom: number;
  riggedCount: number;
  cutouts: number;
  clear: boolean;
  exposes: { name: string; z: number; px: number }[];
  firstFailurePct: number | null;
  firstFailureLayer: string | null;
}

/** Typed data for fn "bands". */
export interface BandsData {
  move: string;
  strengthPct: number;
  radial: boolean;
  zoom: number;
  dolly: number;
  lateral: number;
  cuts: BandCut[];
  totalPx: number;
  totalPctOfWidth: number;
}

export interface BandCut {
  nearName: string;
  farName: string;
  zNear: number;
  zFar: number;
  bandPx: number;
}

// ---------------------------------------------------------------------------
// Scene model (bridge-derived view of the comp, per PANEL_SPEC.md sec. 10.6)
// ---------------------------------------------------------------------------

export interface ScenePlane {
  name: string;
  z: number;
  scalePct: number;
  /** 1 = top of stack = nearest. */
  stackIndex: number;
  /** Derived from the engine's fog-card naming (PXE_FOG_*). */
  isFog: boolean;
}

/**
 * Fields the v1.2 dispatcher does not report (compId, fps, durationSec) are
 * optional; they arrive with the planned explicit-comp dispatcher work
 * (ARCHITECTURE_REVIEW S2 #19). far comes from fn "version".
 */
export interface SceneModel {
  compId?: number;
  compName: string;
  width: number;
  height: number;
  fps?: number;
  durationSec?: number;
  far: number;
  rigged: boolean;
  moveKeys: number;
  planes: ScenePlane[];
}

// ---------------------------------------------------------------------------
// Coverage shapes (panel-side view over checkMove/bands data)
// ---------------------------------------------------------------------------

export type CoverageStatus = "clear" | "exposes" | "cutout";

export interface CoveragePlane {
  name: string;
  z: number;
  status: CoverageStatus;
  /** Present when status === "exposes". */
  px?: number;
}

export interface CoverageReport {
  move: string;
  strengthPct: number;
  planes: CoveragePlane[];
  cutoutsSkipped: number;
  firstFailurePct?: number;
  firstFailurePlane?: string;
  /** Engine informational lines, verbatim. */
  notes: string[];
}

export interface BandsReport {
  move: string;
  strengthPct: number;
  cuts: BandCut[];
  totalPx: number;
  totalPctOfWidth: number;
  notes: string[];
}

/** One results-console entry. The bridge appends one per engine call. */
export interface ConsoleEntry {
  id: number;
  /** HH:MM:SS */
  time: string;
  fn: string;
  ok: boolean;
  msg: string;
  warnings: string[];
  /** Complete raw multi-line engine text. Never truncated by the panel. */
  text: string;
}
