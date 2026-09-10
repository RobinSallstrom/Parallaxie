/**
 * Depth-axis scale for the depth graph: maps z (depth units) to track x
 * (px) and back. Two modes:
 *
 * - "linear":  x proportional to z. Honest but unreadable for deep scenes
 *              (Epic Vista, far 8000, with foreground planes at z < 200).
 * - "log":     x proportional to log1p(z), normalised so 0 -> track start
 *              and axisMax -> track end. Keeps near planes separable.
 *
 * This is pure axis GEOMETRY (presentation), not scene math: bands and
 * coverage always arrive precomputed from the engine (CLAUDE.md rule) and
 * are only positioned with these functions.
 */

export type DepthScaleMode = "linear" | "log";

export interface DepthScale {
  mode: DepthScaleMode;
  /** Depth units -> x px on the track. Clamped to [x0, x1]. */
  toX(z: number): number;
  /** x px -> depth units (inverse). Clamped to [0, axisMax]. */
  toZ(x: number): number;
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export function makeDepthScale(
  mode: DepthScaleMode,
  axisMax: number,
  x0: number,
  x1: number
): DepthScale {
  const max = Math.max(1, axisMax);
  const w = Math.max(1, x1 - x0);
  const norm =
    mode === "log"
      ? (z: number) => Math.log1p(Math.max(0, z)) / Math.log1p(max)
      : (z: number) => z / max;
  const denorm =
    mode === "log"
      ? (t: number) => Math.expm1(t * Math.log1p(max))
      : (t: number) => t * max;
  return {
    mode,
    toX: (z) => x0 + clamp01(norm(z)) * w,
    toZ: (x) => Math.min(max, Math.max(0, denorm(clamp01((x - x0) / w)))),
  };
}
