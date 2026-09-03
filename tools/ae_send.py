#!/usr/bin/env python3
"""Send ExtendScript to After Effects through the adb-mcp proxy (:3001).

Same wire protocol as ae-mcp.py's execute_extend_script tool — it imports
adb-mcp's own socket_client so there is no protocol drift. Used when the
aftereffects MCP server is not loaded into the current Claude session.

  python3 tools/ae_send.py script.jsx [timeout_seconds]
  python3 tools/ae_send.py -  [timeout_seconds]     # read script from stdin
"""
import sys, os, json

ADB = "/Users/robin/Documents/Projects/adb-mcp/mcp"
sys.path.insert(0, ADB)
import socket_client  # noqa: E402

APPLICATION = "aftereffects"
PROXY_URL = "http://localhost:3001"


def send(script_string, timeout=600):
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
    src = sys.stdin.read() if sys.argv[1] == "-" else open(sys.argv[1]).read()
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 600
    try:
        r = send(src, timeout)
    except Exception as e:
        print(json.dumps({"status": "TRANSPORT_ERROR", "message": str(e)}, indent=2))
        return 1
    print(json.dumps(r, indent=2, default=str))
    return 0 if (r or {}).get("status") == "SUCCESS" else 1


if __name__ == "__main__":
    sys.exit(main())
