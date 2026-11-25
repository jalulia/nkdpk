# Ways In (v01)

Open: https://jalulia.github.io/nkdpk/05-identity/R1/NKP-ID-R1-ways-in-v01/

Eleven ways in, each built from one reference: what it cues, the style elements to take, our move for NakedPak, and a board. 125 images.

| Group | Ways in |
|---|---|
| The product | 01 The Sheet · 02 Paper, Windows and Cutouts |
| From the kickoff | 03 Hot Pocket · 04 Graza, Sizzle & Drizzle · 05 Heyday · 06 Lush |
| Our additions | 07 Riff · 08 Rose Delights · 09 Wobble · 10 Cometeer · 11 Lazy Food |

## Editing

Reads the published page from the `nkdpk-pages` Edge Function (slug `ways-in`); falls back to `content.json` when the service is unreachable. Edit works in the browser that already edits the visual boards. Elements are one field, items separated by ` · `. Same tools as the R1 naming moodboards: tiles, pins, uploads, versions, publish.

## Files

- `index.html`, `styles.css`, `app.mjs`: the page
- `page-model.mjs`: schema, identical to `supabase/functions/nkdpk-pages/page-model.mjs` (adds `elements` and `move`)
- `content.json`: content as built, Nov 25, 2026
- `nkdpk-ways-in.spec.json`: the ways in as data (cues, elements, move, images with sources). The page footer also exports the live version.
- `pins.json`: pin catalog for the picker

Images: pins from the nkdpk board (`assets/board-read/plates/`), brand studies (`assets/board-read/brands/`), the visual boards' uploads, and new captures in `assets/ways-in/` (sources in `assets/ways-in/sources.json`).
