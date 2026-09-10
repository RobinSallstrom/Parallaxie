import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginDepthDrag,
  isCEPHost,
  onConsoleEntry,
  pxeCall,
  refreshScene,
  type DepthDragHandle,
} from "../lib/pxe";
import { mockDevControls, type MockPreflightMode } from "../lib/pxe/mock";
import type {
  BandsData,
  CheckMoveData,
  ConsoleEntry,
  DepthOrder,
  MoveType,
  PXEResult,
  SceneModel,
} from "../types/pxe";
import { MOVE_TYPES } from "../types/pxe";
import type { DepthGraphPlane } from "../types/depth-graph";
import { Console } from "./components/Console";
import { ConfirmButton } from "./components/ConfirmButton";
import { DepthGraph } from "./components/DepthGraph";
import "./main.scss";

const MAX_CONSOLE_ENTRIES = 50;

const FAR_PRESETS: { label: string; far: number | null }[] = [
  { label: "Room (1500)", far: 1500 },
  { label: "Exterior (5000)", far: 5000 },
  { label: "Epic Vista (8000)", far: 8000 },
  { label: "Custom", far: null },
];

type PreflightState = "none" | "clean" | "warn" | "blocker";

interface CoverageState {
  check: CheckMoveData | null;
  bands: BandsData | null;
  stale: boolean;
  pending: boolean;
}

export const App = () => {
  // --- state ---------------------------------------------------------------
  const [scene, setScene] = useState<SceneModel | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [preflightState, setPreflightState] = useState<PreflightState>("none");
  const [busy, setBusy] = useState(false);

  // Build section
  const [far, setFar] = useState(5000);
  const [order, setOrder] = useState<DepthOrder>("stack");

  // Move section
  const [move, setMove] = useState<MoveType>("Push-In");
  const [strengthPct, setStrengthPct] = useState(5);
  const [duration, setDuration] = useState(6);

  // Coverage
  const [coverage, setCoverage] = useState<CoverageState>({
    check: null,
    bands: null,
    stale: true,
    pending: false,
  });

  const [selectedPlaneId, setSelectedPlaneId] = useState<string | null>(null);
  const dragRef = useRef<{ planeId: string; handle: DepthDragHandle } | null>(null);

  // --- console feed (bridge is the single choke point) ----------------------
  useEffect(() => {
    return onConsoleEntry((entry) => {
      setEntries((prev) => [...prev.slice(-(MAX_CONSOLE_ENTRIES - 1)), entry]);
    });
  }, []);

  // --- scene refresh ---------------------------------------------------------
  const refresh = useCallback(async () => {
    const model = await refreshScene();
    setScene(model);
    if (model) setFar((f) => (f === 5000 && model.far !== 5000 ? model.far : f));
    return model;
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // --- coverage evaluation (never during a drag; PANEL_SPEC 7.1) ------------
  const evalCoverage = useCallback(
    async (moveArg: MoveType, pctArg: number) => {
      setCoverage((c) => ({ ...c, pending: true }));
      const check = await pxeCall<CheckMoveData>("checkMove", {
        move: moveArg,
        pct: pctArg,
      });
      const bands = await pxeCall<BandsData>("bands", {
        move: moveArg,
        pct: pctArg,
      });
      setCoverage({
        check: check.ok ? check.data : null,
        bands: bands.ok ? bands.data : null,
        stale: !check.ok,
        pending: false,
      });
    },
    []
  );

  const markCoverageStale = () =>
    setCoverage((c) => ({ ...c, stale: true }));

  // --- actions ---------------------------------------------------------------
  const runCommand = async (
    task: () => Promise<PXEResult<unknown> | unknown>,
    opts: { refresh?: boolean; coverage?: boolean } = {}
  ) => {
    setBusy(true);
    try {
      await task();
      if (opts.refresh !== false) await refresh();
      if (opts.coverage) await evalCoverage(move, strengthPct);
    } finally {
      setBusy(false);
    }
  };

  const onPreflight = () =>
    runCommand(async () => {
      const res = await pxeCall("preflight");
      if (!res.ok) {
        setPreflightState("blocker");
      } else if (res.warnings.some((w) => w.indexOf("BLOCKER") === 0)) {
        setPreflightState("blocker");
      } else if (res.warnings.length > 0) {
        setPreflightState("warn");
      } else {
        setPreflightState("clean");
      }
    });

  const onBuild = () =>
    runCommand(() => pxeCall("build", { far, order }), { coverage: true });

  const onBuildSelected = () =>
    runCommand(() => pxeCall("buildSelected", { far }), { coverage: true });

  const onAdoptSelected = () =>
    runCommand(() => pxeCall("adoptSelected"), { coverage: true });

  const onDistribute = (near: number, dFar: number, bias: number) =>
    runCommand(() => pxeCall("distribute", { near, far: dFar, bias }), {
      coverage: true,
    });

  const onRandomize = (band: number) =>
    runCommand(() => pxeCall("randomize", { band }), { coverage: true });

  const onApplyMove = () =>
    runCommand(() => pxeCall("applyMove", { move, duration, pct: strengthPct }));

  const onClearMove = () => runCommand(() => pxeCall("clearMove"));

  const onStatus = () =>
    runCommand(async () => {
      const model = await refreshScene({ silent: false });
      setScene(model);
    }, { refresh: false });

  // --- depth gesture wiring (drag protocol lives in the bridge) -------------
  const optimisticZ = (planeId: string, z: number) => {
    setScene((s) =>
      s
        ? {
            ...s,
            planes: s.planes.map((p) =>
              p.name === planeId ? { ...p, z } : p
            ),
          }
        : s
    );
  };

  const onDepthChange = (planeId: string, z: number) => {
    optimisticZ(planeId, z);
    markCoverageStale();
    const current = dragRef.current;
    if (!current || current.planeId !== planeId || !current.handle.isOpen()) {
      // New gesture: one undo group opens now, before the first mutation.
      if (current?.handle.isOpen()) void current.handle.commit();
      dragRef.current = { planeId, handle: beginDepthDrag(planeId) };
    }
    dragRef.current!.handle.update(z);
  };

  const onDepthCommit = (planeId: string, z: number) => {
    optimisticZ(planeId, z);
    const current = dragRef.current;
    void (async () => {
      if (current && current.planeId === planeId && current.handle.isOpen()) {
        await current.handle.commit(z);
      } else {
        // Numeric-entry commit without a drag: one setDepth, one gesture.
        const handle = beginDepthDrag(planeId);
        await handle.commit(z);
      }
      dragRef.current = null;
      await refresh();
      await evalCoverage(move, strengthPct);
    })();
  };

  // --- derived view data ------------------------------------------------------
  const planesForGraph: DepthGraphPlane[] = (scene?.planes ?? []).map((p) => {
    const exposed = coverage.check?.exposes.find((e) => e.name === p.name);
    const cut = coverage.bands?.cuts.find((c) => c.nearName === p.name);
    return {
      id: p.name, // name-keyed until engine id addressing ships (S2 #16)
      name: p.name,
      depth: p.z,
      // The v1.2 dispatcher names exposing planes but only counts cut-outs;
      // per-plane clear/cutout naming is a planned dispatcher extension
      // (PANEL_SPEC 7.4), so everything not exposing is honestly "unknown".
      coverageStatus: exposed ? "exposes" : "unknown",
      bandPx: cut ? cut.bandPx : null,
      exposesPx: exposed?.px,
      isFog: p.isFog,
    };
  });

  const rigChip = !scene
    ? "No active comp"
    : scene.moveKeys > 0
      ? "MOVE: " + scene.moveKeys + " keys"
      : scene.rigged
        ? "RIGGED " + scene.planes.length + " planes"
        : "FLAT";

  const hasComp = scene !== null;

  // --- render ------------------------------------------------------------------
  return (
    <div className="app">
      {!isCEPHost() && <MockDevStrip onChanged={() => void refresh()} />}

      <header className="panel-header">
        <div className="comp-info" onClick={() => void refresh()} title="Click to refresh">
          <span className="comp-name">
            {scene ? scene.compName + " " + scene.width + "x" + scene.height : "No active comp"}
          </span>
          <span className={"chip chip-" + preflightState}>{rigChip}</span>
        </div>
        <button className="primary" disabled={!hasComp && isCEPHost()} onClick={onPreflight}>
          Preflight
        </button>
      </header>

      <section>
        <div className="section-title">1 Build</div>
        <div className="row">
          <label>
            Preset
            <select
              value={String(FAR_PRESETS.find((p) => p.far === far)?.far ?? "custom")}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== "custom") setFar(Number(v));
              }}
            >
              {FAR_PRESETS.map((p) => (
                <option key={p.label} value={p.far === null ? "custom" : String(p.far)}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Far
            <input
              type="number"
              min={100}
              step={100}
              value={far}
              onChange={(e) => setFar(Math.max(100, Math.round(Number(e.target.value) || 100)))}
            />
          </label>
          <label>
            Depth order
            <select value={order} onChange={(e) => setOrder(e.target.value as DepthOrder)}>
              <option value="stack">Stack (top = nearest)</option>
              <option value="name-asc">Name ascending (01 = farthest)</option>
              <option value="name-desc">Name descending (01 = nearest)</option>
            </select>
          </label>
        </div>
        <div className="row">
          {scene?.rigged ? (
            <ConfirmButton
              label="Build from Comp"
              message="Rebuild resets all depths. Confirm?"
              onConfirm={onBuild}
              disabled={busy}
            />
          ) : (
            <button className="primary wide" disabled={busy} onClick={onBuild}>
              Build from Comp
            </button>
          )}
        </div>
        <div className="row">
          {scene?.rigged ? (
            <ConfirmButton
              label="Build from Selected"
              message="Rebuild resets all depths. Confirm?"
              onConfirm={onBuildSelected}
              disabled={busy}
            />
          ) : (
            <button className="wide" disabled={busy} onClick={onBuildSelected}>
              Build from Selected
            </button>
          )}
        </div>
      </section>

      <section>
        <div className="section-title">2 Depth</div>
        <DepthGraph
          planes={planesForGraph}
          camera={{ label: "cam" }}
          far={scene?.far ?? far}
          coverageStale={coverage.stale || coverage.pending}
          selectedPlaneId={selectedPlaneId}
          onSelectPlane={setSelectedPlaneId}
          onDepthChange={onDepthChange}
          onDepthCommit={onDepthCommit}
        />
        <DepthActions
          disabled={busy || !scene?.rigged}
          defaultFar={scene?.far ?? far}
          onDistribute={onDistribute}
          onRandomize={onRandomize}
        />
        <div className="row">
          <button
            disabled={busy || !scene?.rigged}
            onClick={onAdoptSelected}
            title="Rig the layers selected in the timeline into the existing scene; depth is inherited from the plane below each one"
          >
            Add Selected to Rig
          </button>
        </div>
      </section>

      <section>
        <div className="section-title">3 Move</div>
        <div className="move-grid">
          {MOVE_TYPES.map((m) => (
            <button
              key={m}
              className={m === move ? "primary" : ""}
              onClick={() => {
                setMove(m);
                markCoverageStale();
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="row">
          <label>
            Strength %
            <input
              type="number"
              min={0.1}
              max={50}
              step={0.1}
              value={strengthPct}
              title="Normalised: apparent scale change of the mid-depth plane (push/pull) or fraction of comp size (drift/rise/sink)"
              onChange={(e) => {
                setStrengthPct(Number(e.target.value) || 0.1);
                markCoverageStale();
              }}
              onBlur={() => void evalCoverage(move, strengthPct)}
            />
          </label>
          <label>
            Duration s
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 0.1)}
            />
          </label>
        </div>
        <div className="row">
          <button
            className="primary"
            disabled={busy || !scene?.rigged}
            title="One move per shot - applying replaces the previous move"
            onClick={onApplyMove}
          >
            Apply Move
          </button>
          <button disabled={busy} onClick={onClearMove}>
            Clear Move
          </button>
          <button
            disabled={busy || !scene?.rigged}
            onClick={() => void evalCoverage(move, strengthPct)}
          >
            Check Coverage
          </button>
        </div>
        <CoverageSummary coverage={coverage} onSetMaxSafe={(pct) => {
          setStrengthPct(pct);
          void evalCoverage(move, pct);
        }} />
      </section>

      <section>
        <div className="section-title">Utilities</div>
        <div className="row">
          <button disabled={busy} onClick={() => runCommand(() => pxeCall("auditOff"))}>
            Audit Off
          </button>
          <ConfirmButton
            label="Bake"
            message="Bake strips the rig, keeping the result. Confirm?"
            onConfirm={() => void runCommand(() => pxeCall("bake"))}
            disabled={busy}
          />
          <ConfirmButton
            label="Reset"
            message="Reset returns layers to flat 2D. Confirm?"
            onConfirm={() => void runCommand(() => pxeCall("reset"))}
            disabled={busy}
          />
          <button disabled={busy} onClick={onStatus}>
            Status
          </button>
        </div>
      </section>

      <Console entries={entries} />
    </div>
  );
};

// ---------------------------------------------------------------------------

const DepthActions = (props: {
  disabled: boolean;
  defaultFar: number;
  onDistribute: (near: number, far: number, bias: number) => void;
  onRandomize: (band: number) => void;
}) => {
  const [near, setNear] = useState(0);
  const [dFar, setDFar] = useState<number | null>(null);
  const [bias, setBias] = useState(1);
  const [band, setBand] = useState(200);
  const effFar = dFar ?? props.defaultFar;
  return (
    <div className="row depth-actions">
      <button
        disabled={props.disabled}
        onClick={() => props.onDistribute(near, effFar, bias)}
      >
        Distribute
      </button>
      <label>
        near
        <input type="number" value={near} onChange={(e) => setNear(Number(e.target.value) || 0)} />
      </label>
      <label>
        far
        <input type="number" value={effFar} onChange={(e) => setDFar(Number(e.target.value) || 0)} />
      </label>
      <label>
        bias
        <input
          type="number"
          step={0.1}
          value={bias}
          title="Above 1 clusters planes toward the camera"
          onChange={(e) => setBias(Number(e.target.value) || 1)}
        />
      </label>
      <button disabled={props.disabled} onClick={() => props.onRandomize(band)}>
        Randomize
      </button>
      <label>
        band
        <input type="number" value={band} onChange={(e) => setBand(Number(e.target.value) || 0)} />
      </label>
    </div>
  );
};

const CoverageSummary = (props: {
  coverage: CoverageState;
  onSetMaxSafe: (pct: number) => void;
}) => {
  const { check, bands, stale, pending } = props.coverage;
  const [showBands, setShowBands] = useState(false);
  if (!check) {
    return (
      <div className="coverage line-dim">
        Coverage: {pending ? "evaluating..." : "no evaluation yet - Check Coverage"}
      </div>
    );
  }
  const maxSafe =
    check.firstFailurePct !== null
      ? Math.max(0.1, Math.round((check.firstFailurePct - 0.5) * 10) / 10)
      : null;
  return (
    <div className={"coverage" + (stale || pending ? " stale" : "")}>
      <div>
        Coverage: {check.move} {check.strengthPct}% . {check.riggedCount} planes .{" "}
        {check.cutouts} cut-outs skipped
        {pending ? " . evaluating..." : stale ? " . stale - changes pending" : ""}
      </div>
      {check.clear ? (
        <div className="line-ok">CLEAR - no full-frame plate runs out of paint</div>
      ) : (
        check.exposes.map((e) => (
          <div key={e.name} className="line-error">
            EXPOSES {e.name} (z {e.z}) {e.px}px of empty canvas
          </div>
        ))
      )}
      {check.firstFailurePct !== null && (
        <div>
          First failure at {check.firstFailurePct}%
          {check.firstFailureLayer ? " (" + check.firstFailureLayer + ")" : ""}
          {maxSafe !== null && (
            <button className="mini" onClick={() => props.onSetMaxSafe(maxSafe)}>
              Set Max Safe ({maxSafe}%)
            </button>
          )}
        </div>
      )}
      {bands && (
        <div>
          <button className="mini" onClick={() => setShowBands((s) => !s)}>
            {showBands ? "Hide bands" : "Show bands"}
          </button>
          {showBands && (
            <pre className="entry-body">
              {bands.cuts
                .map(
                  (c) =>
                    c.nearName + " (z" + c.zNear + ") -> " + c.farName +
                    " (z" + c.zFar + "): " + c.bandPx + " px"
                )
                .join("\n") +
                "\ntotal " + bands.totalPx + " px (" + bands.totalPctOfWidth + "% of width)"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

/** Browser-only dev strip for the mock (PANEL_SPEC 11 dev switches). */
const MockDevStrip = (props: { onChanged: () => void }) => {
  const [mode, setMode] = useState<MockPreflightMode>(mockDevControls.preflightMode);
  return (
    <div className="mock-strip">
      MOCK MODE (no After Effects)
      <label>
        preflight
        <select
          value={mode}
          onChange={(e) => {
            const m = e.target.value as MockPreflightMode;
            mockDevControls.preflightMode = m;
            setMode(m);
          }}
        >
          <option value="clean">clean</option>
          <option value="warn">warnings</option>
          <option value="blocker">blocked</option>
        </select>
      </label>
      <button
        className="mini"
        onClick={() => {
          mockDevControls.forceNextError = true;
        }}
      >
        Force next error
      </button>
      <button
        className="mini"
        onClick={() => {
          mockDevControls.forceNextTimeout = true;
        }}
      >
        Force next timeout
      </button>
      <button className="mini" onClick={props.onChanged}>
        Refresh scene
      </button>
    </div>
  );
};
