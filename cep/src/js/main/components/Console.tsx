import type { ConsoleEntry } from "../../types/pxe";

/**
 * Results console (PANEL_SPEC.md sec. 8): the single output surface.
 * Full multi-line engine text, always -- first-line-only display is engine
 * defect #9 and must never recur. Line classification by the engine's own
 * prefix vocabulary; warnings[] additionally rendered amber in full.
 */

const lineClass = (line: string): string => {
  const token = line.replace(/^\s+/, "").split(/\s/)[0];
  switch (token) {
    case "BLOCKER":
    case "ERROR:":
    case "ERROR":
      return "line-error";
    case "WARN":
      return "line-warn";
    case "EXPOSES":
      return "line-error";
    case "OK:":
    case "OK":
    case "CLEAR":
      return "line-ok";
    case "NOTE":
    case "INFO":
      return "line-dim";
    default:
      return "";
  }
};

const copyText = (text: string) => {
  try {
    void navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard unavailable; nothing to break */
  }
};

export const Console = (props: { entries: ConsoleEntry[] }) => {
  return (
    <div className="console">
      <div className="section-title">Results</div>
      <div className="console-scroll">
        {props.entries.length === 0 && (
          <div className="line-dim console-empty">No engine calls yet.</div>
        )}
        {props.entries.map((e) => (
          <div key={e.id} className={"console-entry" + (e.ok ? "" : " failed")}>
            <div className="entry-head">
              <span className="entry-time">{e.time}</span>
              <span className="entry-fn">{e.fn}</span>
              <button className="mini" onClick={() => copyText(e.text)}>
                Copy
              </button>
            </div>
            <pre className="entry-body">
              {e.text.split("\n").map((line, i) => (
                <div key={i} className={lineClass(line)}>
                  {line}
                </div>
              ))}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
};
