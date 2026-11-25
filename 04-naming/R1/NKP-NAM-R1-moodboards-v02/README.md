# R1 naming moodboards (v02)

Open: https://jalulia.github.io/nkdpk/04-naming/R1/NKP-NAM-R1-moodboards-v02/

Three boards per naming territory, named by kind and medium, 101 pins from the nkdpk board, each used once. Replaces v01 (kept beside it).

| | A | B | C |
|---|---|---|---|
| 01 Kitchen Alchemy | Macro Texture | Color-Field Still Life | Surreal Collage |
| 02 All Together Now | Type in the Food | Food Illustration | Table Photography |
| 03 Delicious Ritual | Label Typography | Spot Illustration | Demonstration Photography |

## Editing

Reads the published page from the `nkdpk-pages` Edge Function (slug `r1-naming-moodboards`); falls back to `content.json` when the service is unreachable. Edit works in the browser that already edits the visual boards. Click any text to change it; tiles have ← → Lead Edit Remove and drag; each board has Add pins, Upload images, Add image by URL, Lead image, Move, Delete. Drafts save as you go; Publish makes them public; Saved versions restores any of the last 200.

## Files

- `index.html`, `styles.css`, `app.mjs`: the page
- `page-model.mjs`: schema, identical to `supabase/functions/nkdpk-pages/page-model.mjs`
- `content.json`: content as built, Nov 24, 2026
- `pins.json`: 341-pin catalog for the picker
