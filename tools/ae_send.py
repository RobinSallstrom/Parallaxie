#!/usr/bin/env python3
"""Send an ExtendScript file to a running After Effects through the adb-mcp bridge.

OPTIONAL developer convenience for headless suite runs. Parallaxie itself has no
dependency on it: the engine and the smoke suite run from File > Scripts > Run
Script File with nothing but After Effects installed. This driver exists so the
suite can be triggered from a terminal (or by an LLM agent) without a human
click, using the open-source adb-mcp bridge (https://github.com/mikechambers/adb-mcp):
its proxy on :3001 plus the "AfterEffects MCP Agent" CEP panel inside AE.

It imports adb-mcp's own socket_client so there is no wire-protocol drift with
the bridge's execute_extend_script tool. Tell it where adb-mcp lives:

  PXE_ADB_MCP_PATH   directory containing adb-mcp's socket_client.py (the bridge's
                     "mcp" folder); the adb-mcp repo root is also accepted.
  ADB_MCP_PATH       same, used when PXE_ADB_MCP_PATH is not set.

  python3 tools/ae_send.py script.jsx [timeout_seconds]
  python3 tools/ae_send.py -  [timeout_seconds]     # read script from stdin

Note that sending a script as a string leaves $.fileName empty inside AE, so
PXE_SmokeTest.jsx (which resolves siblings via $.fileName) must be run through a
one-line wrapper that $.evalFile()s it by absolute path; see CLAUDE.md.
"""
import sys, os, json

APPLICATION = "aftereffects"
PROXY_URL = "http://localhost:3001"


def locate_adb_mcp():
    """Return the directory holding socket_client.py, or exit with a clear message."""
    raw = os.environ.get("PXE_ADB_MCP_PATH") or os.environ.get("ADB_MCP_PATH")
    if not raw:
        sys.exit(
            "ae_send.py: adb-mcp location not set.\n"
            "  Set PXE_ADB_MCP_PATH (or ADB_MCP_PATH) to the directory that contains\n"
            "  adb-mcp's socket_client.py - the bridge's 'mcp' folder, e.g.\n"
            "    Windows:  set PXE_ADB_MCP_PATH=C:\\path\\to\\adb-mcp\\mcp\n"
            "    macOS:    export PXE_ADB_MCP_PATH=/path/to/adb-mcp/mcp\n"
            "  The bridge is optional; the suite also runs from AE's File > Scripts menu."
        )
    for cand in (raw, os.path.join(raw, "mcp")):
        if os.path.isfile(os.path.join(cand, "socket_client.py")):
            return os.path.abspath(cand)
    sys.exit(
        "ae_send.py: socket_client.py not found under %r (checked it and its 'mcp' subfolder).\n"
        "  Point PXE_ADB_MCP_PATH at adb-mcp's 'mcp' directory." % raw
    )


def send(script_string, timeout=600):
    sys.path.insert(0, locate_adb_mcp())
    import socket_client  # noqa: E402  (adb-mcp's own client)

    socket_client.configure(app=APPLICATION, url=PROXY_URL, timeout=timeout)
    command = {
        "application": APPLICATION,
        "action": "executeExtendScript",
        "options": {"scriptString": script_string},
    }
    return socket_client.send_message_blocking(command, timeout=timeout)


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    if sys.argv[1] == "-":
        src = sys.stdin.read()
    else:
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            src = f.read()
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 600
    try:
        r = send(src, timeout)
    except SystemExit:
        raise
    except Exception as e:
        print(json.dumps({"status": "TRANSPORT_ERROR", "message": str(e)}, indent=2))
        return 1
    print(json.dumps(r, indent=2, default=str))
    return 0 if (r or {}).get("status") == "SUCCESS" else 1


if __name__ == "__main__":
    sys.exit(main())
