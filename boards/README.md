# Visual boards

Open https://jalulia.github.io/nkdpk/boards/ to view the published collection.

The private editor link opens a shared draft. Edit territory names and descriptions, board titles, brand studies, links, image labels and captions. Drag territories, board tabs and images to reorder them. Use the image inspector for crop position, fit and grid span. Keyboard-accessible move buttons are available alongside drag controls.

New files are uploaded to a private storage bucket. Draft changes autosave. **Publish changes** updates the shared page and releases only the images referenced in that edition. **Undo**, **Redo**, saved versions and JSON backup export are available. The private editing key is held outside this repository.

## Implementation

Buildless HTML, CSS and ES modules. Archivo comes from the existing site assets.

Content lives in the existing NakedPak analytics Supabase project, isolated in the `nkdpk_boards_*` tables and the private `nkdpk-boards` bucket. The review gallery and its sign-in system are separate and unchanged. The `nkdpk-boards` Edge Function authenticates editor requests with short-lived sessions issued from a random private editing key. The browser never receives a service key. Tables are inaccessible to anonymous and authenticated Data API roles.

The editor uses optimistic revision checks. A conflicting write preserves the current tab's work and offers export or loading the latest version. The last 200 saved revisions are retained. Image uploads use immutable IDs. Removing an image from a board does not erase versions that reference it.

`seed.json` is the initial public edition used if the content service cannot be reached. The normal view fetches the current published document.

## Checks

```sh
node --test tests/boards.test.mjs
python3 tools/build.py
python3 tools/verify.py
```

The server implementation and schema are under `supabase/`. The shared validation model in `boards/model.mjs` must match the copy deployed with the Edge Function. Source image references remain attached to individual images.

Viewing links may be shared. Keep the private editing link private.

