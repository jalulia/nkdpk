# Visual boards

Open https://jalulia.github.io/nkdpk/boards/.

Viewing requires no password or special URL. The owner's browser remembers editing access. Click **Edit boards**, edit text and images, then **Publish changes**. **Done editing** returns to viewing without removing that browser's editing access.

Draft changes autosave to the content service. Image uploads, drag ordering, crop controls, undo, saved versions and JSON export are available. A browser credential renews short-lived editor sessions automatically; it is never embedded in public source. Other browsers can view the published boards without receiving write access.

Old /review/ and /review/legacy.html bookmarks redirect to /boards/. The older private archive remains intact; it has not been copied into public storage. The existing board-read presentations remain at their own URLs.

The buildless frontend uses the existing NakedPak Supabase project in isolated nkdpk_boards_* tables. Row-level access restrictions and version-conflict checks remain enabled.
