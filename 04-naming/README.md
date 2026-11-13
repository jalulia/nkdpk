# Naming

Territories, candidates, screening. One folder per round; nothing is overwritten.

- R1/, R2/ …
- NKP-NAM-R1-<slug>-v01.<ext>; a revision is -v02 beside -v01
- Manifest entry: NAM-###

Add an entry to `data/manifest.json`, then run `python3 tools/build.py && python3 tools/verify.py`.
