# Packaging

Master outer box, flavor system, dielines on FPO dimensions. One folder per round.

- R1/, R2/ …
- NKP-PKG-R1-<slug>-v01.<ext>
- Manifest entry: PKG-###

Add an entry to `data/manifest.json`, then run `python3 tools/build.py && python3 tools/verify.py`.
