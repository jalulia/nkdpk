# NakedPak repo: working rules for agents

Julia drops references, materials and loose ideas into chat for this project. Each drop becomes a manifest entry. `index.html` is generated; never edit it by hand.

## Every drop

1. Read `data/manifest.json`. Next ID = highest existing ID of that kind + 1 (REF-002, NOTE-001, INP-004 …).
2. Files go in the section folder, named per that folder's `README.md`.
   - Web reference: capture it headless at a 1440 px viewport (dismiss cookie banners with the least-permissive option), crop the parts that show *why* it was dropped, save JPEG at 1800 px max into `02-references/REF-###-<source>-<slug>/01-….jpg`.
   - Image or file she attaches: copy as is; never recompress an original she supplied.
   - Loose idea with no file: entry only, `section: "notes"`, `kind: "note"`.
3. Entry fields: `id, section, kind, status, title, tagline, date, added_by, source{name,url}, note` (her words, verbatim), `relevance` (one or two sentences on why it matters for NakedPak), `elements[{label,text,fig}]` (what to take from it), `tags`, `files[{path,caption}]`, `capture`.
4. Add a `log` line: `{date, type, text, refs}`. Types: Added, Received, Decision, Feedback, Round, Presented, Milestone, Setup.
5. `python3 tools/build.py && python3 tools/verify.py` — must end with 0 errors.
6. Render the page headless at 1440 and 390 wide and look at it before committing.
7. Commit (`Add REF-002: <title>`) and push to `main`. If the push fails, write a `.bundle` to the outputs folder and give the two-line fetch/merge/push sequence.

## Rules

- Never overwrite or delete. Revisions are new files (`-v02`) or new round folders; mark the old entry `status: "superseded"`.
- Every entry links to the actual file it names, never to an index or folder standing in for it.
- Every index entry is dated: `date` (YYYY-MM-DD) is required and shows on the index. `verify.py` fails an undated entry.
- US English only. Plain, short copy; no filler.
- Design: black on white, Archivo only, the 10-column grid in `assets/site/manifest.css`. No accent color, no textures, no oxblood. Text never touches a rule.
- `color-scheme: light` and explicit white backgrounds stay on `html` and `body`.
- The repo is public. Don't add contracts, pricing, personal contact details or unreleased client financials; keep those in the iCloud folder or the shared drive and link to them.
