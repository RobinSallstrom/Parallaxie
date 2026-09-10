import { useState } from "react";
import type { DepthGraphProps } from "../../types/depth-graph";

/**
 * =========================================================================
 * PLACEHOLDER -- DEPTH GRAPH SLOT
 * =========================================================================
 * A later agent replaces this component with the real depth graph
 * (PANEL_SPEC.md sec. 5: lanes, tracks, handles, band segments, keyboard).
 * The props contract it must consume is FROZEN in
 * src/js/types/depth-graph.ts (DepthGraphProps) and is already produced by
 * the app shell -- swap the component, keep the interface.
 *
 * Until then this renders a functional fallback: one row per plane with a
 * numeric z field (the spec's accessibility fallback, 5.6) wired to
 * onDepthCommit, plus a live range slider wired to onDepthChange /
 * onDepthCommit so the drag protocol (throttle + undo group + watchdog)
 * is exercised end to end.
 */
export const DepthGraphPlaceholder = (props: DepthGraphProps) => {
  const { planes, camera, far } = props;
  const axisMax = Math.max(far, ...planes.map((p) => p.depth), 1);
  // Local text state for numeric fields keyed by plane id.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const commitField = (planeId: string, raw: string, current: number) => {
    const v = Math.round(parseFloat(raw));
    setDrafts((d) => {
      const next = { ...d };
      delete next[planeId];
      return next;
    });
    if (!isFinite(v) || v === current) return; // reject NaN: revert, no call
    props.onDepthCommit(planeId, v);
  };

  if (planes.length === 0) {
    return (
      <div className="depth-graph-placeholder empty">
        Nothing rigged - run Preflight, then Build
      </div>
    );
  }

  return (
    <div className="depth-graph-placeholder">
      <div className="placeholder-note">
        [depth graph placeholder - real component pending; props contract in
        src/js/types/depth-graph.ts]
      </div>
      <div className="axis-caption">
        {camera.label} | z axis 0 .. {axisMax}
      </div>
      {planes.map((p) => (
        <div
          key={p.id}
          className={
            "plane-row" +
            (p.isFog ? " fog" : "") +
            (props.selectedPlaneId === p.id ? " selected" : "")
          }
          onClick={() => props.onSelectPlane?.(p.id)}
        >
          <span className="plane-name" title={p.name}>
            {p.name}
            {p.isFog ? " (fog)" : ""}
          </span>
          <input
            type="range"
            min={0}
            max={axisMax}
            step={1}
            value={p.depth}
            onChange={(e) => props.onDepthChange(p.id, Number(e.target.value))}
            onPointerUp={(e) =>
              props.onDepthCommit(p.id, Number((e.target as HTMLInputElement).value))
            }
            onKeyUp={(e) =>
              props.onDepthCommit(p.id, Number((e.target as HTMLInputElement).value))
            }
          />
          <input
            className="z-field"
            type="text"
            inputMode="numeric"
            value={drafts[p.id] ?? String(p.depth)}
            onChange={(e) =>
              setDrafts((d) => ({ ...d, [p.id]: e.target.value }))
            }
            onBlur={(e) => commitField(p.id, e.target.value, p.depth)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                commitField(p.id, (e.target as HTMLInputElement).value, p.depth);
              if (e.key === "Escape")
                setDrafts((d) => {
                  const next = { ...d };
                  delete next[p.id];
                  return next;
                });
            }}
          />
          <span
            className={"coverage coverage-" + p.coverageStatus}
            title={
              p.coverageStatus === "cutout"
                ? "Cut-out plane - not a full-frame plate; skipped by coverage"
                : undefined
            }
          >
            {p.coverageStatus === "exposes"
              ? "EXPOSES " + (p.exposesPx ?? "?") + "px"
              : p.coverageStatus === "clear"
                ? "clear"
                : p.coverageStatus === "cutout"
                  ? "cut-out"
                  : "-"}
            {props.coverageStale ? " (stale)" : ""}
          </span>
        </div>
      ))}
    </div>
  );
};
