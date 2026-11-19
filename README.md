# NakedPak

Naming, identity and packaging for the US soup and stew launch.

[Open the project index](https://jalulia.github.io/nkdpk/)

The public index holds the brief, references, original input requests and activity log. The current client input register, annotated pin catalog and HTML study are in the shared iCloud project folder, `IC BRidge/NkdPk`.

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

## Site analytics

The index and private review record page loads and navigation. The index also records link clicks and expanded records in the **register** Supabase project, under `public.nkdpk_events`. The `view` event counts page loads. The random `pv` groups interactions within one load. The tracker respects Do Not Track and Global Privacy Control and skips local files, frames, automated browsers and the library CMS owner session.

## Private review

The live study includes the deck, client register, sources and searchable reference ledger. Share the private review link saved beside the HTML master in iCloud. Its URL fragment contains the decryption key. The published `review/study.bin` contains the encrypted edition. The browser decrypts it on the viewer’s device. Analytics record page type and board or reference numbers.

To update the same review link, run `node tools/seal-study.mjs /path/to/study.html /private/path/to/NakedPak_Private_Review.webloc` and commit the updated ciphertext.

## Adding something

1. Put the file in its folder, named by that folder's README.
2. Add an entry to `data/manifest.json` (copy the closest existing entry) and a line to `log`.
3. `python3 tools/build.py && python3 tools/verify.py`
4. Commit and push to update GitHub Pages.

Nothing is overwritten. A revision is a new file (`-v02`) or a new round folder; the old entry stays, marked `superseded`.

Fonts: Archivo (SIL Open Font License, `assets/site/fonts/OFL.txt`).
