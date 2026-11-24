# R1 naming moodboards (v01)

Open: https://jalulia.github.io/nkdpk/04-naming/R1/NKP-NAM-R1-moodboards-v01/

Sam's three naming territories, each paired with a visual territory and three ways in. 106 pins from the nkdpk board, each used once.

## Editing

The page reads the published version from the `nkdpk-pages` Edge Function (slug `r1-moodboards`). If that service can't be reached, it shows `content.json`, the content as built.

Editing works in the browser that already edits the visual boards (same editing key, `nkdpk.browser.editor.v1`). Click **Edit**:

- Click any text to change it. Enter or Esc finishes.
- Images: drag to reorder, or use ← → Lead Edit Remove on each tile. Edit sets caption, alt text, link, fit and crop focus, or replaces the image.
- Each way in: Add pins (picker over all 341 pins on the board; pins already on the page are marked), Upload images, Add image by URL, Lead image on/off, Move, Delete.
- Each territory: Add way in, Move, Delete. Add territory sits at the end of the page.
- Edits save as a draft automatically. **Publish** makes the draft public. **Saved versions** lists the last 200 revisions; any one can be loaded back into the draft. **Export JSON** downloads the draft.

## Files

- `index.html`, `styles.css`, `app.mjs`: the page
- `page-model.mjs`: document schema, shared with `supabase/functions/nkdpk-pages/` (keep the two copies identical)
- `content.json`: content as built, Nov 24, 2026
- `pins.json`: the 341-pin catalog the picker uses (number, description, proportion, pin link)

Backend: `supabase/pages-schema.sql` (tables `nkdpk_pages_state`, `nkdpk_pages_history`, function `nkdpk_pages_save`) and `supabase/functions/nkdpk-pages/`. Uploads, editing sessions and image hosting are shared with the visual boards.
