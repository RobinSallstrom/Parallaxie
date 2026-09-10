#!/usr/bin/env python3
"""Verify the Parallaxie smoke-test frame locks by md5.

AE's saveFrameToPng returns to the bridge BEFORE the bytes are flushed to disk,
so hashing immediately after the run reports phantom mismatches. This waits for
every file to stop growing before hashing.

  python3 tools/verify_frames.py [_pxe_test_dir]
"""
import sys, os, time, hashlib

FRAMES = ["f_flat.png", "f_built.png", "f_push_t0.png",
          "f_prebake.png", "f_postbake.png", "f_push_end.png",
          "f_scaled_flat.png", "f_scaled_built.png"]


def wait_stable(path, timeout=120, quiet=1.0):
    """Block until path exists and its size is unchanged for `quiet` seconds."""
    deadline = time.time() + timeout
    last, stable_since = -1, None
    while time.time() < deadline:
        try:
            sz = os.path.getsize(path)
        except OSError:
            sz = -1
        if sz >= 0 and sz == last:
            if stable_since is None:
                stable_since = time.time()
            elif time.time() - stable_since >= quiet:
                return True
        else:
            stable_since = None
        last = sz
        time.sleep(0.25)
    return False


def md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_pxe_test")
    missing = []
    for n in FRAMES:
        p = os.path.join(d, n)
        if not wait_stable(p):
            missing.append(n)
    if missing:
        print("MISSING/UNSTABLE: " + ", ".join(missing))
        return 1
    h = {n: md5(os.path.join(d, n)) for n in FRAMES}
    for n in FRAMES:
        print(f"{h[n]}  {n}")
    checks = [
        ("FRAME-0 LOCK  (flat == built == push_t0)",
         h["f_flat.png"] == h["f_built.png"] == h["f_push_t0.png"]),
        ("BAKE LOCK     (prebake == postbake)",
         h["f_prebake.png"] == h["f_postbake.png"]),
        ("MOVE NON-NULL (push_end != flat)",
         h["f_push_end.png"] != h["f_flat.png"]),
        ("SCALED FRAME-0 LOCK  (scaled_flat == scaled_built)  [defect #1]",
         h["f_scaled_flat.png"] == h["f_scaled_built.png"]),
    ]
    print()
    for name, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}")
    return 0 if all(ok for _, ok in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
