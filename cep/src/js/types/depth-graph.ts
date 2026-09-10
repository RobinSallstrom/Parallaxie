/**
 * DEPTH GRAPH COMPONENT CONTRACT -- stable props interface.
 *
 * The depth graph itself (PANEL_SPEC.md sec. 5) is built by a later agent.
 * This file is the contract between the app shell and that component:
 * the shell already produces these props (see main/main.tsx) and renders a
 * placeholder (main/components/DepthGraphPlaceholder.tsx) against them.
 * Extend this interface additively; do not rename existing fields.
 */

export type DepthGraphCoverageStatus =
  | "clear"
  | "exposes"
  | "cutout"
  /** No coverage evaluation has landed yet, or the last one is stale. */
  | "unknown";

export interface DepthGraphPlane {
  /**
   * Stable identity for React keys and callbacks. Today this is the layer
   * display name -- the engine addresses layers by name until id-keyed
   * references ship (ARCHITECTURE_REVIEW S2 #16). Duplicate layer names
   * therefore misbehave here exactly as they do in the engine.
   */
  id: string;
  /** Layer display name as shown in the lane. */
  name: string;
  /** Current z in depth units (0 = camera plane). */
  depth: number;
  /** From the last coverage evaluation; "unknown" when stale/never run. */
  coverageStatus: DepthGraphCoverageStatus;
  /**
   * Reveal band width in px behind this plane (the cut between this plane
   * and the next-farther plane), from PXE.bands data. null when no move is
   * being evaluated or this plane is the farthest. NEVER computed panel-side.
   */
  bandPx: number | null;
  /** px of exposed empty canvas when coverageStatus === "exposes". */
  exposesPx?: number;
  /** Fog cards render as lanes with a "fog" tag at reduced opacity. */
  isFog?: boolean;
}

export interface DepthGraphCamera {
  /** Gutter label; "cam" in v1. Not interactive in v1. */
  label: string;
}

export interface DepthGraphProps {
  /** Lanes in stacking order: index 0 = top of stack = nearest. */
  planes: DepthGraphPlane[];
  camera: DepthGraphCamera;
  /** Depth-axis extent. Grows if any plane exceeds it; never lies. */
  far: number;
  /** Grays out coverage indicators while a re-evaluation is pending. */
  coverageStale?: boolean;
  selectedPlaneId?: string | null;
  onSelectPlane?: (planeId: string | null) => void;
  /**
   * Live value during a drag (already optimistic in the graph; the shell
   * forwards it to the bridge drag channel, which throttles to ~12 Hz and
   * owns the single undo group -- see lib/pxe/bridge.ts beginDepthDrag).
   */
  onDepthChange: (planeId: string, z: number) => void;
  /** Gesture end: final value; triggers commit + coverage re-evaluation. */
  onDepthCommit: (planeId: string, z: number) => void;
}
