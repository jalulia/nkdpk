# Inputs

Material from the team and client: strategy findings, chef flavor profiles, pouch and box dimensions, FPO panels. Files go in as received; never edit them in place.

- YYYY-MM-DD-<source>-<slug>.<ext> — e.g. 2026-11-17-strategy-findings.pdf
- Manifest entry: INP-###

Add an entry to `data/manifest.json`, then run `python3 tools/build.py && python3 tools/verify.py`.
