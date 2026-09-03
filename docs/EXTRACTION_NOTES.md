# Extraction notes — 2026-09-03

Parallaxie was extracted from `../cinematics`, where it was built alongside the Battlemarked
2.5D shots. The split follows one rule: **the engine and its harness came here; anything
Battlemarked-specific stayed there.**

## Copied here (originals still in ../cinematics — nothing was deleted)

| File | What |
|---|---|
| `Parallaxie_v1.jsx` | the engine, v1.2 |
| `PXE_SmokeTest.jsx` | 49-test suite |
| `Parallaxie_Brief.md` | product brief v1.0 |
| `tools/ae_send.py` | headless ExtendScript driver |
| `tools/verify_frames.py` | frame-lock md5 checker |
| `_pxe_test/report.txt` | last known-good run (baseline) |

## Deliberately left in ../cinematics

- `BM_*.psd` — Battlemarked art (studio-owned)
- `BM_Handoff_Brief.md`, `BM_Parallax_Pipeline.md`, `BM_Backfill_Playbook.md` — shot pipeline docs
- `BM_Ythryn_Build_v1.jsx` — a per-shot build script, not engine code
- `_guides/*.json` — traced guide polygons for specific cuts
- `tools/trace_guide*.py`, `segment_*.py`, `refine_from_stroke.py`, `reconstruct_gradient.py`,
  `ps_send.py` — the **Photoshop-side** split pipeline. Different half of the problem.
- `Ref/`, `_analysis_frames/`, `_test01/`, `test-footage/`, tutorial mp4s — reference media

## Before deleting the originals from cinematics

The copies here are byte-identical, but `../cinematics` is **not under version control**, so
verify a headless suite run passes from this folder first. Until then, treat cinematics as
the source of truth.

Note that `../cinematics/CLAUDE.md` still documents the Parallaxie API inline. Once this
repo is trusted, trim that section down to a pointer at `../Parallaxie/CLAUDE.md` so the two
can't drift.
