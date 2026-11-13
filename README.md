# NakedPak

Brand naming, identity and packaging for NakedPak's US direct-to-consumer soup and stew launch. ø co., sprint Nov 13 – Dec 18, 2026.

**Manifest:** https://jalulia.github.io/nkdpk/ — brief, schedule, inputs, references, notes, rounds, presentations, log and every file, linked.

Internal working document. The page is marked `noindex`, but the repository is public.

## Structure

| Folder | Holds |
| --- | --- |
| `00-brief/` | Brief mirrors and the locked brief |
| `01-inputs/` | Strategy findings, chef flavor profiles, dimensions, FPO panels |
| `02-references/` | One folder per outside reference, numbered captures |
| `03-notes/` | Loose ideas (longer ones as files) |
| `04-naming/` | Naming rounds: `R1/`, `R2/` … |
| `05-identity/` | Identity rounds |
| `06-packaging/` | Box and flavor-system rounds |
| `07-presentations/` | Decks as presented, one dated folder each |
| `08-handoff/` | Final delivery |
| `_archive/` | Material retired on request |
| `data/manifest.json` | Source of truth for the page |
| `tools/` | `build.py` writes `index.html`; `verify.py` checks it |

Working masters (source files, large client drops) live in the iCloud folder `IC BRidge/NkdPk`, which mirrors these folders. This repository holds what the team views.

## Adding something

1. Put the file in its folder, named by that folder's README.
2. Add an entry to `data/manifest.json` (copy the closest existing entry) and a line to `log`.
3. `python3 tools/build.py && python3 tools/verify.py`
4. Commit and push. Pages updates in about a minute.

Nothing is overwritten. A revision is a new file (`-v02`) or a new round folder; the old entry stays, marked `superseded`.

Fonts: Archivo (SIL Open Font License, `assets/site/fonts/OFL.txt`).
