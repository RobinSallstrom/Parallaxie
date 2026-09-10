import { useLayoutEffect, useRef, useState } from "react";
import type {
  DepthGraphPlane,
  DepthGraphProps,
} from "../../../types/depth-graph";
import { makeDepthScale, type DepthScaleMode } from "./depthScale";
import "./DepthGraph.scss";

/**
 * The depth graph (PANEL_SPEC.md sec. 5): SVG side view of the rig.
 * Camera glyph in the left gutter at z=0, one lane per rigged plane in
 * stacking order (top lane = nearest), each plane a horizontal bar from 0
 * to its z with a draggable handle at z.
 *
 * - Drag the handle to set depth: onDepthChange fires live (the bridge
 *   throttles engine writes and owns the single undo group), onDepthCommit
 *   on release. ESC during a drag restores the starting depth.
 * - Click a lane to select; Up/Down move selection; Left/Right nudge the
 *   selected plane (Shift = 10x coarse, Alt = 1); each press-and-release
 *   is one gesture. Enter or double-click opens the numeric z entry.
 * - No click-to-jump on the track (PANEL_SPEC 5.2): pointer-down away from
 *   the handle only selects.
 * - Coverage is display-only: status, exposed px and band widths all come
 *   from props (engine data). The band segment maps engine px to screen px
 *   1:1 clamped to the track -- a display convention, never band math.
 * - Depth-scale toggle linear/log for deep scenes.
 */

// --- geometry (px at 1:1; the svg viewBox tracks the measured width) --------
const PAD = 4;
const CAM_W = 30; // left gutter for the camera glyph
const NAME_W = 100;
const COV_W = 96; // right gutter for the coverage readout
const AXIS_H = 16;
const LANE_H = 30; // >= spec minimum 28
const BOT_PAD = 4;
const HANDLE_W = 10;
const HIT_SLOP = 6; // invisible slop each side of the handle

// --- palette (PANEL_SPEC sec. 12; status colours differ in lightness, not
// hue alone: ok is light, fail is dark, cutout/unknown are mid/dim grays,
// and each status also gets a distinct drawn glyph) --------------------------
const C = {
  text: "#d6d6d6",
  text2: "#9a9a9a",
  grid: "#383838",
  zeroLine: "#4a4a4a",
  accent: "#5a9bd4",
  bar: "#5c6670",
  handle: "#8b8b8b",
  ok: "#7dbb5e", // clear   - light green
  fail: "#c04b4b", // exposes - dark red
  neutral: "#9a9a9a", // cutout  - mid gray
  dim: "#6f6f6f", // unknown - dim gray
};

interface DragState {
  planeId: string;
  pointerId: number;
  startZ: number;
  z: number;
  moved: boolean;
  target: Element;
}

interface EditState {
  planeId: string;
  text: string;
}

const midEllipsize = (s: string, max = 14): string =>
  s.length <= max ? s : s.slice(0, max - 7) + ".." + s.slice(s.length - 5);

export const DepthGraph = (props: DepthGraphProps) => {
  const { planes, camera, far, coverageStale, selectedPlaneId } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Callbacks come from the shell as fresh closures each render; window
  // listeners and capture handlers read them through this ref.
  const propsRef = useRef(props);
  propsRef.current = props;

  const [width, setWidth] = useState(480);
  const [scaleMode, setScaleMode] = useState<DepthScaleMode>("linear");
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const kbRef = useRef<{ planeId: string; z: number } | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  // --- responsive width: viewBox mirrors the measured px width (1:1) -------
  // Re-runs when the empty state flips: the scroll element does not exist
  // while "Nothing rigged" is shown, so a mount-only effect would observe
  // nothing and the graph would stay at the fallback width forever.
  const isEmpty = planes.length === 0;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(300, el.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isEmpty]);

  // --- axis ------------------------------------------------------------------
  // Never lie about where a plane is: the axis grows past far if needed.
  const axisMax = Math.max(far, 1, ...planes.map((p) => p.depth));
  const trackX0 = PAD + CAM_W + NAME_W + 8;
  const trackX1 = Math.max(trackX0 + 40, width - PAD - COV_W - 8);
  const height = AXIS_H + Math.max(planes.length, 1) * LANE_H + BOT_PAD;
  const lanesY0 = AXIS_H;
  const lanesY1 = height - BOT_PAD;
  const scale = makeDepthScale(scaleMode, axisMax, trackX0, trackX1);

  const liveDepth = (p: DepthGraphPlane) =>
    drag && drag.planeId === p.id ? drag.z : p.depth;

  const localX = (e: { clientX: number }) => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? e.clientX - r.left : 0;
  };

  // --- drag gesture -----------------------------------------------------------
  const setDragBoth = (d: DragState | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const endDrag = (commitZ: number | null) => {
    const d = dragRef.current;
    if (!d) return;
    try {
      (d.target as SVGElement).releasePointerCapture?.(d.pointerId);
    } catch {
      // capture may already be released
    }
    setDragBoth(null);
    if (commitZ !== null) propsRef.current.onDepthCommit(d.planeId, commitZ);
  };

  const onLanePointerDown =
    (p: DepthGraphPlane) => (e: React.PointerEvent<SVGRectElement>) => {
      if (e.button !== 0) return;
      propsRef.current.onSelectPlane?.(p.id);
      containerRef.current?.focus();
      const hx = scale.toX(liveDepth(p));
      // Grab only within handle + slop; otherwise it is a select-click.
      // No click-to-jump on the track (PANEL_SPEC 5.2).
      if (Math.abs(localX(e) - hx) <= HANDLE_W / 2 + HIT_SLOP) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragBoth({
          planeId: p.id,
          pointerId: e.pointerId,
          startZ: p.depth,
          z: p.depth,
          moved: false,
          target: e.currentTarget,
        });
        e.preventDefault();
      }
    };

  const onLanePointerMove =
    (p: DepthGraphPlane) => (e: React.PointerEvent<SVGRectElement>) => {
      const d = dragRef.current;
      if (!d || d.planeId !== p.id || d.pointerId !== e.pointerId) return;
      const z = Math.round(scale.toZ(localX(e)));
      if (z === d.z && d.moved) return;
      setDragBoth({ ...d, z, moved: true });
      // Live value; the bridge throttles engine writes to ~12 Hz and holds
      // the one undo group for the whole gesture.
      propsRef.current.onDepthChange(p.id, z);
    };

  const onLanePointerEnd =
    (p: DepthGraphPlane) => (e: React.PointerEvent<SVGRectElement>) => {
      const d = dragRef.current;
      if (!d || d.planeId !== p.id || d.pointerId !== e.pointerId) return;
      // A press without movement was a select-click, not a depth gesture.
      endDrag(d.moved ? d.z : null);
    };

  // ESC cancels a drag (restore starting depth through the same gesture so
  // the undo group closes at the original value); window blur commits the
  // last value (mirrors the bridge watchdog).
  useLayoutEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      if (d.moved) {
        propsRef.current.onDepthChange(d.planeId, d.startZ);
        endDrag(d.startZ);
      } else {
        endDrag(null);
      }
    };
    const onBlur = () => {
      const d = dragRef.current;
      if (d) endDrag(d.moved ? d.z : null);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- keyboard (PANEL_SPEC 5.5) ----------------------------------------------
  const selIndex = planes.findIndex((p) => p.id === selectedPlaneId);
  const nudgeStep = Math.max(1, Math.round(far / 500));

  const commitKbGesture = () => {
    const g = kbRef.current;
    if (!g) return;
    kbRef.current = null;
    propsRef.current.onDepthCommit(g.planeId, g.z);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (edit) return; // the numeric entry handles its own keys
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      commitKbGesture();
      if (planes.length === 0) return;
      const next =
        selIndex < 0
          ? 0
          : e.key === "ArrowUp"
            ? Math.max(0, selIndex - 1)
            : Math.min(planes.length - 1, selIndex + 1);
      props.onSelectPlane?.(planes[next].id);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      if (selIndex < 0) return;
      const plane = planes[selIndex];
      const step = e.altKey ? 1 : e.shiftKey ? nudgeStep * 10 : nudgeStep;
      const dir = e.key === "ArrowLeft" ? -1 : 1; // left = toward camera
      const cur =
        kbRef.current && kbRef.current.planeId === plane.id
          ? kbRef.current.z
          : plane.depth;
      const z = Math.min(axisMax, Math.max(0, cur + dir * step));
      // Held key auto-repeats inside one gesture: opened on the first
      // keydown, committed on keyup (same protocol as a pointer drag).
      kbRef.current = { planeId: plane.id, z };
      props.onDepthChange(plane.id, z);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (selIndex >= 0) openEdit(planes[selIndex]);
      return;
    }
    if (e.key === "Escape") {
      commitKbGesture();
      e.currentTarget.blur(); // release focus back to the host app
    }
  };

  const onKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") commitKbGesture();
  };

  // --- numeric entry (double-click or Enter; PANEL_SPEC 5.6) ------------------
  const openEdit = (p: DepthGraphPlane) => {
    props.onSelectPlane?.(p.id);
    setEdit({ planeId: p.id, text: String(p.depth) });
  };

  const closeEdit = (commit: boolean) => {
    if (!edit) return;
    const p = planes.find((pl) => pl.id === edit.planeId);
    const raw = edit.text;
    setEdit(null);
    containerRef.current?.focus();
    if (!commit || !p) return;
    const v = Math.round(parseFloat(raw));
    if (!isFinite(v) || v === p.depth) return; // reject NaN: revert, no call
    // Numeric entry may exceed far; the axis grows rather than lying.
    props.onDepthCommit(p.id, Math.max(0, v));
  };

  // --- empty state --------------------------------------------------------------
  if (planes.length === 0) {
    return (
      <div className="depth-graph empty">
        Nothing rigged - run Preflight, then Build
      </div>
    );
  }

  // --- edit overlay position ------------------------------------------------------
  const editIndex = edit ? planes.findIndex((p) => p.id === edit.planeId) : -1;
  let editLeft = trackX0;
  let editTop = 0;
  if (edit && editIndex >= 0) {
    const hx = scale.toX(liveDepth(planes[editIndex]));
    editLeft = Math.min(Math.max(trackX0, hx + 8), trackX1 - 72);
    editTop = AXIS_H + editIndex * LANE_H + (LANE_H - 22) / 2;
  }

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];
  const gcy = (lanesY0 + lanesY1) / 2;

  return (
    <div
      ref={containerRef}
      className="depth-graph"
      tabIndex={0}
      role="group"
      aria-label="Depth graph"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          commitKbGesture();
        }
      }}
    >
      <div className="dg-toolbar">
        <span className="dg-caption">depth scale</span>
        <div className="dg-toggle">
          <button
            type="button"
            className={"mini" + (scaleMode === "linear" ? " active" : "")}
            onClick={() => setScaleMode("linear")}
            title="Linear z axis"
          >
            Linear
          </button>
          <button
            type="button"
            className={"mini" + (scaleMode === "log" ? " active" : "")}
            onClick={() => setScaleMode("log")}
            title="Logarithmic z axis - keeps near planes readable in deep scenes"
          >
            Log
          </button>
        </div>
        <span className="dg-caption dg-far">
          far {far}
          {axisMax > far ? " . axis to " + axisMax : ""}
        </span>
      </div>

      <div ref={scrollRef} className="dg-scroll">
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={"0 0 " + width + " " + height}
        >
          <defs>
            <pattern
              id="dgHatchNeutral"
              width={5}
              height={5}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1={0} y1={0} x2={0} y2={5} stroke={C.text2} strokeWidth={1.5} />
            </pattern>
            <pattern
              id="dgHatchFail"
              width={5}
              height={5}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1={0} y1={0} x2={0} y2={5} stroke={C.fail} strokeWidth={1.5} />
            </pattern>
          </defs>

          {/* axis gridlines at 0/25/50/75/100% of far, labels 0 and far only */}
          {gridFractions.map((f) => {
            const x = scale.toX(far * f);
            return (
              <line
                key={f}
                x1={x}
                y1={lanesY0}
                x2={x}
                y2={lanesY1}
                stroke={f === 0 ? C.zeroLine : C.grid}
                strokeWidth={1}
              />
            );
          })}
          <text x={trackX0} y={11} textAnchor="middle" className="dg-axis-label" fill={C.text2}>
            0
          </text>
          <text
            x={scale.toX(far)}
            y={11}
            textAnchor={axisMax > far ? "middle" : "end"}
            className="dg-axis-label"
            fill={C.text2}
          >
            {far}
          </text>
          {axisMax > far && (
            <text x={trackX1} y={11} textAnchor="end" className="dg-axis-label" fill={C.text2}>
              {axisMax}
            </text>
          )}

          {/* camera glyph, left gutter, z = 0 (not interactive in v1) */}
          <g stroke={C.text2} fill="none" strokeWidth={1.5}>
            <rect x={PAD + 3} y={gcy - 7} width={12} height={14} rx={2} />
            <path
              d={
                "M " + (PAD + 15) + " " + (gcy - 3) +
                " L " + (PAD + 22) + " " + (gcy - 7) +
                " L " + (PAD + 22) + " " + (gcy + 7) +
                " L " + (PAD + 15) + " " + (gcy + 3) + " Z"
              }
            />
          </g>
          <text x={PAD + 13} y={gcy + 22} textAnchor="middle" className="dg-axis-label" fill={C.text2}>
            {camera.label}
          </text>

          {/* lanes, stacking order top-to-bottom (index 0 = nearest) */}
          {planes.map((p, i) => {
            const laneY = AXIS_H + i * LANE_H;
            const cy = laneY + LANE_H / 2;
            const z = liveDepth(p);
            const hx = scale.toX(z);
            const isSel = selectedPlaneId === p.id;
            const isDrag = drag !== null && drag.planeId === p.id;
            const status = p.coverageStatus;
            const statusColor =
              status === "clear"
                ? C.ok
                : status === "exposes"
                  ? C.fail
                  : status === "cutout"
                    ? C.neutral
                    : C.dim;
            const covText =
              status === "exposes"
                ? "EXPOSES " + (p.exposesPx ?? "?") + "px"
                : status === "clear"
                  ? "CLEAR"
                  : status === "cutout"
                    ? "CUT-OUT"
                    : "-";
            const covX = trackX1 + 10;

            // Band segment: engine bandPx drawn 1:1 in screen px, clamped
            // to the track. Display convention only -- the number in the
            // label is always the engine's.
            const hasBand = p.bandPx !== null && p.bandPx > 0;
            const bandX = hx + HANDLE_W / 2;
            const bandW = hasBand
              ? Math.max(3, Math.min(p.bandPx as number, Math.max(0, trackX1 - bandX)))
              : 0;
            const bandLabelFits = bandX + bandW + 40 <= trackX1;

            // z readout flips side near the right edge
            const zRight = hx + HANDLE_W / 2 + 6;
            const zFlip = zRight > trackX1 - 52;

            const handlers = {
              onPointerDown: onLanePointerDown(p),
              onPointerMove: onLanePointerMove(p),
              onPointerUp: onLanePointerEnd(p),
              onPointerCancel: onLanePointerEnd(p),
              onDoubleClick: () => openEdit(p),
            };

            return (
              <g key={p.id} className={"dg-lane" + (p.isFog ? " fog" : "")}>
                {isSel && (
                  <rect
                    x={PAD}
                    y={laneY + 1}
                    width={width - 2 * PAD}
                    height={LANE_H - 2}
                    fill="none"
                    stroke={C.accent}
                    strokeWidth={1}
                  />
                )}
                {status === "exposes" && (
                  <line
                    x1={trackX0}
                    y1={laneY + 1.5}
                    x2={trackX1}
                    y2={laneY + 1.5}
                    stroke={C.fail}
                    strokeWidth={1}
                    opacity={coverageStale ? 0.5 : 1}
                  />
                )}

                {/* name (middle-ellipsized; full name in tooltip) */}
                <text
                  x={PAD + CAM_W + 4}
                  y={cy + 3.5}
                  className="dg-name"
                  fill={C.text}
                  opacity={p.isFog ? 0.6 : isSel ? 1 : 0.85}
                >
                  {midEllipsize(p.name)}
                  <title>{p.name}</title>
                </text>
                {p.isFog && (
                  <text
                    x={trackX0 - 12}
                    y={cy + 3.5}
                    textAnchor="end"
                    className="dg-tag"
                    fill={C.text2}
                  >
                    fog
                  </text>
                )}

                {/* bar 0 -> z (reading aid; the handle is the control) */}
                <rect
                  x={trackX0}
                  y={cy - 3}
                  width={Math.max(0, hx - trackX0)}
                  height={6}
                  fill={isDrag || isSel ? C.accent : C.bar}
                  opacity={isDrag ? 0.9 : 0.7}
                />

                {/* reveal band behind the handle (engine data) */}
                {hasBand && (
                  <g opacity={coverageStale ? 0.4 : 0.9}>
                    <rect
                      x={bandX}
                      y={cy - 3}
                      width={bandW}
                      height={6}
                      fill={
                        status === "exposes"
                          ? "url(#dgHatchFail)"
                          : "url(#dgHatchNeutral)"
                      }
                    />
                    <text
                      x={bandLabelFits ? bandX + bandW + 4 : bandX - 4}
                      y={laneY + LANE_H - 4}
                      textAnchor={bandLabelFits ? "start" : "end"}
                      className="dg-band-label"
                      fill={status === "exposes" ? C.fail : C.text2}
                    >
                      {p.bandPx}px
                    </text>
                  </g>
                )}

                {/* numeric depth on the bar */}
                <text
                  x={zFlip ? hx - HANDLE_W / 2 - 6 : zRight}
                  y={laneY + 11}
                  textAnchor={zFlip ? "end" : "start"}
                  className="dg-z"
                  fill={isDrag ? C.accent : C.text2}
                >
                  z {z}
                </text>

                {/* coverage indicator + readout (right gutter) */}
                <g opacity={coverageStale ? 0.5 : 1}>
                  {status === "clear" && (
                    <circle cx={covX + 4} cy={cy} r={3.5} fill="none" stroke={C.ok} strokeWidth={1.5} />
                  )}
                  {status === "exposes" && (
                    <g stroke={C.fail} strokeWidth={1.5}>
                      <line x1={covX + 1} y1={cy - 3} x2={covX + 7} y2={cy + 3} />
                      <line x1={covX + 1} y1={cy + 3} x2={covX + 7} y2={cy - 3} />
                    </g>
                  )}
                  {status === "cutout" && (
                    <circle cx={covX + 4} cy={cy} r={2} fill={C.neutral} />
                  )}
                  {status === "unknown" && (
                    <line x1={covX + 1} y1={cy} x2={covX + 7} y2={cy} stroke={C.dim} strokeWidth={1.5} />
                  )}
                  <text x={covX + 12} y={cy + 3.5} className="dg-cov" fill={statusColor}>
                    {covText}
                    {status === "cutout" && (
                      <title>
                        Cut-out plane - not a full-frame plate; skipped by coverage
                      </title>
                    )}
                  </text>
                </g>

                {/* hit surface: whole track row; grabs only within slop */}
                <rect
                  className="dg-hit"
                  x={trackX0 - HIT_SLOP}
                  y={laneY}
                  width={trackX1 - trackX0 + 2 * HIT_SLOP}
                  height={LANE_H}
                  fill="transparent"
                  {...handlers}
                />

                {/* handle (the control) */}
                <rect
                  className={"dg-handle" + (isDrag ? " dragging" : "")}
                  x={hx - HANDLE_W / 2}
                  y={laneY + 5}
                  width={HANDLE_W}
                  height={LANE_H - 10}
                  rx={1.5}
                  fill={isDrag || isSel ? C.accent : C.handle}
                  {...handlers}
                >
                  <title>{p.name + "  z " + z}</title>
                </rect>
              </g>
            );
          })}
        </svg>

        {edit && editIndex >= 0 && (
          <input
            className="dg-edit"
            style={{ left: editLeft, top: editTop }}
            autoFocus
            type="text"
            inputMode="numeric"
            value={edit.text}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) =>
              setEdit((s) => (s ? { ...s, text: e.target.value } : s))
            }
            onBlur={() => closeEdit(true)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") closeEdit(true);
              if (e.key === "Escape") closeEdit(false);
            }}
          />
        )}
      </div>
    </div>
  );
};
