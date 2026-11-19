#!/usr/bin/env python3
"""Check the manifest and the built page before committing.

    python3 tools/verify.py

Fails on: duplicate IDs, unknown sections, entry files that don't exist, links in
index.html that point at missing files, a stale index.html, British spellings.
Warns on: files in content folders that no entry links to.
"""
import json
import pathlib
import re
import subprocess
import sys
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = "https://github.com/jalulia/nkdpk"
CONTENT = ("00-brief/", "01-inputs/", "02-references/", "03-notes/", "04-naming/",
           "05-identity/", "06-packaging/", "07-presentations/", "08-handoff/")
UK = r"\b(colour\w*|grey\w*|centre\w*|artefact\w*|organis\w*|favourit\w*|flavour\w*|behaviour\w*|catalogue\w*|appetis\w*|recognis\w*|optimis\w*|travell\w*|modell\w*|analys(e|ed|es|ing)\b)"

errors, warns = [], []
m = json.loads((ROOT / "data/manifest.json").read_text())
sections = {s["id"] for s in m["sections"]}
ids = [x["id"] for x in m["entries"]]
for i in {i for i in ids if ids.count(i) > 1}:
    errors.append(f"duplicate id {i}")
linked = set()
for x in m["entries"]:
    if x["section"] not in sections:
        errors.append(f"{x['id']}: unknown section {x['section']}")
    for f in x.get("files", []):
        linked.add(f["path"])
        if not (ROOT / f["path"]).is_file():
            errors.append(f"{x['id']}: missing file {f['path']}")
for r in m["log"]:
    for ref in r.get("refs", []):
        if ref not in ids:
            errors.append(f"log {r['date']}: unknown ref {ref}")
mirror = m["project"]["brief_source"].get("mirror")
if mirror:
    linked.add(mirror)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for k, v in attrs:
            if k in ("href", "src") and v:
                self.urls.append(v)


page = ROOT / "index.html"
if not page.exists():
    errors.append("index.html missing; run tools/build.py")
else:
    p = Links()
    p.feed(page.read_text())
    for u in p.urls:
        path = None
        if u.startswith(REPO + "/blob/main/") or u.startswith(REPO + "/tree/main/"):
            path = u.split("/main/", 1)[1]
        elif not re.match(r"^(https?:|mailto:|data:|#)", u):
            path = u.split("#")[0].split("?")[0]
        if path and not (ROOT / path).exists():
            errors.append(f"index.html links to missing {path}")
    if (ROOT / "data/manifest.json").stat().st_mtime > page.stat().st_mtime + 1:
        errors.append("index.html is older than data/manifest.json; run tools/build.py")

try:
    tracked = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout.splitlines()
except Exception:
    tracked = [str(q.relative_to(ROOT)) for q in ROOT.rglob("*") if q.is_file()]
for f in tracked:
    if f.startswith(CONTENT) and not f.endswith("README.md") and f not in linked:
        warns.append(f"not linked from any entry: {f}")

for f in [ROOT / "data/manifest.json", ROOT / "README.md", ROOT / "CLAUDE.md", *ROOT.glob("0*/README.md")]:
    if f.exists():
        for n, line in enumerate(f.read_text().splitlines(), 1):
            for hit in re.finditer(UK, line, flags=re.I):
                errors.append(f"{f.relative_to(ROOT)}:{n} British spelling “{hit.group(0)}”")

for w in warns:
    print("warn ", w)
for er in errors:
    print("FAIL ", er)
print(f"{len(ids)} entries · {len(errors)} errors · {len(warns)} warnings")
sys.exit(1 if errors else 0)
