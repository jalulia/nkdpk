#!/usr/bin/env python3
"""Rebuild index.html from data/manifest.json and the files in the repository.

    python3 tools/build.py            # write index.html
    python3 tools/build.py --today 2026-11-20   # preview the schedule as of another day

No third-party packages. Content renders without JavaScript; the page script
only highlights the current section and filters the file list.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import pathlib
import struct
import subprocess
from collections import OrderedDict

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data" / "manifest.json"
OUT = ROOT / "index.html"
REPO = "https://github.com/jalulia/nkdpk"
SITE_DIRS = ("assets/site/", "tools/", "data/")
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"}
BLOB_EXT = {".md", ".json", ".py", ".txt", ".csv"}  # shown on GitHub, not served raw


# ---------------------------------------------------------------- helpers
def e(s) -> str:
    return html.escape(str(s), quote=True)


def d(iso: str, year: bool = True) -> str:
    x = dt.date.fromisoformat(iso)
    return f"{x:%b} {x.day}, {x.year}" if year else f"{x:%b} {x.day}"


def human(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}".replace(".0 ", " ")
        n /= 1024
    return str(n)


def href(path: str) -> str:
    """Link to the actual file: served directly on Pages, or GitHub's view for text sources."""
    if path.startswith(("http://", "https://")):
        return path
    if pathlib.Path(path).suffix.lower() in BLOB_EXT:
        return f"{REPO}/blob/main/{path}"
    return path


def folder_href(folder: str) -> str:
    return f"{REPO}/tree/main/{folder.rstrip('/')}"


def image_size(p: pathlib.Path):
    """Width and height for JPEG/PNG without third-party packages."""
    try:
        with p.open("rb") as f:
            head = f.read(26)
            if head[:8] == b"\x89PNG\r\n\x1a\n":
                return struct.unpack(">II", head[16:24])
            if head[:2] == b"\xff\xd8":
                f.seek(2)
                while True:
                    marker, = struct.unpack(">H", f.read(2))
                    length, = struct.unpack(">H", f.read(2))
                    if 0xFFC0 <= marker <= 0xFFCF and marker not in (0xFFC4, 0xFFC8, 0xFFCC):
                        f.read(1)
                        h, w = struct.unpack(">HH", f.read(4))
                        return w, h
                    f.seek(length - 2, 1)
    except Exception:
        pass
    return None


def repo_files():
    """Tracked + untracked (not ignored) files, with the date each was first added."""
    try:
        out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"],
                             cwd=ROOT, capture_output=True, text=True, check=True).stdout
        paths = sorted({p for p in out.splitlines() if p})
        log = subprocess.run(["git", "log", "--diff-filter=A", "--name-only", "--format=@%as"],
                             cwd=ROOT, capture_output=True, text=True).stdout
    except Exception:
        paths = sorted(str(p.relative_to(ROOT)) for p in ROOT.rglob("*")
                       if p.is_file() and ".git/" not in str(p))
        log = ""
    added, cur = {}, None
    for line in log.splitlines():
        if line.startswith("@"):
            cur = line[1:]
        elif line and cur:
            added[line] = cur  # log is newest first; the last write is the first add
    files = []
    for p in paths:
        fp = ROOT / p
        if not fp.is_file() or p == "index.html":
            continue
        date = added.get(p) or dt.date.fromtimestamp(fp.stat().st_mtime).isoformat()
        files.append({"path": p, "bytes": fp.stat().st_size, "date": date})
    return files


ARROW = ('<svg class="arw" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 8 8 2M3.5 2H8v4.5" '
         'fill="none" stroke="currentColor" stroke-width="1.1"/></svg>')
STATUS = {
    "current": "Current", "new": "New", "keep": "Keep", "maybe": "Maybe", "drop": "Drop",
    "awaited": "Awaited", "received": "Received", "in-review": "In review",
    "approved": "Approved", "superseded": "Superseded", "archived": "Archived",
}
FILLED = {"current", "keep", "received", "approved"}


def status(s: str) -> str:
    if not s:
        return ""
    cls = "on" if s in FILLED else ("off" if s in {"superseded", "archived", "drop"} else "")
    return f'<span class="st {cls}">{e(STATUS.get(s, s.title()))}</span>'


def ext_link(url: str, label: str) -> str:
    return f'<a href="{e(url)}" rel="noopener">{e(label)}{ARROW}</a>'


# ---------------------------------------------------------------- blocks
def rail(m, counts, weekinfo, updated):
    items = []
    for s in m["sections"]:
        c = counts.get(s["id"], 0)
        items.append(f'<li><a href="#{s["id"]}"><span class="n">{s["num"]}</span>'
                     f'<span class="t">{e(s["title"])}</span><span class="c">{c or ""}</span></a></li>')
    items.append('<li class="gap"><a href="#log"><span class="n"></span><span class="t">Log</span>'
                 f'<span class="c">{len(m["log"])}</span></a></li>')
    items.append('<li><a href="#files"><span class="n"></span><span class="t">Files</span>'
                 f'<span class="c">{counts["_files"]}</span></a></li>')
    return f"""<nav class="rail" aria-label="Sections">
  <a class="rail-id" href="#top"><b>{e(m['project']['name'])}</b><span>Project manifest</span></a>
  <ol class="rail-nav">{''.join(items)}</ol>
  <div class="rail-foot"><span>{e(weekinfo)}</span><span>Updated {e(d(updated))}</span>{ext_link(REPO, 'Repository')}</div>
</nav>"""


def masthead(m, weekinfo, nxt, counts, updated):
    p = m["project"]
    s = p["sprint"]
    return f"""<header class="mast" id="top">
  <div class="grid mast-top">
    <span class="c1">{e(p['scope'])}</span>
    <span class="c2">{e(p['studio'])}</span>
    <span class="c3">Sprint {e(d(s['start'], False))} – {e(d(s['end']))}</span>
    <span class="c4">Updated {e(d(updated))}</span>
  </div>
  <h1>{e(p['name'])}</h1>
  <p class="mast-sub">{e(p['subtitle'])}</p>
  <p class="intro">{e(p['intro'])}</p>
  <dl class="grid stats">
    <div><dt>Week</dt><dd>{e(weekinfo.replace("Week ", ""))}</dd></div>
    <div><dt>Next</dt><dd>{e(nxt)}</dd></div>
    <div><dt>References</dt><dd>{counts.get('references', 0)}</dd></div>
    <div><dt>Files</dt><dd>{counts['_files']}</dd></div>
  </dl>
</header>"""


def schedule(m, today, cur_week):
    s = m["project"]["sprint"]
    mon = dt.date.fromisoformat(s["week1_monday"])
    cols = []
    for w in range(1, s["weeks"] + 1):
        start, end = mon + dt.timedelta(weeks=w - 1), mon + dt.timedelta(weeks=w - 1, days=4)
        rng = f"{start:%b} {start.day}–{end.day}" if start.month == end.month else \
              f"{start:%b} {start.day} – {end:%b} {end.day}"
        state = "now" if w == cur_week else ("past" if w < cur_week else "")
        ms = "".join(
            f'<li><b>{e(x["label"])}</b>{(" <span>" + e(d(x["date"], False)) + "</span>") if x.get("date") else ""}</li>'
            for x in m["milestones"] if x["week"] == w)
        notes = "".join(f'<li class="cal">{e(x["label"])} <span>{e(d(x["date"], False))}</span></li>'
                        for x in m.get("calendar_notes", []) if x["week"] == w)
        here = '<span class="here">This week</span>' if state == "now" else ""
        cols.append(f'<li class="wk {state}"><div class="wk-h"><span>Wk {w}</span>{here}</div>'
                    f'<div class="wk-d">{e(rng)}</div><ul>{ms}{notes}</ul></li>')
    return f"""<section class="sched" aria-label="Schedule">
  <ol class="weeks">{''.join(cols)}</ol>
  <p class="fine">Week dates assume Monday–Friday weeks counted from the kickoff week. The brief gives week numbers only.</p>
</section>"""


def sec_head(s, count_label=""):
    return f"""<header class="grid sec-head">
    <span class="sec-num">{s['num']}</span>
    <h2 id="{s['id']}-h">{e(s['title'])}</h2>
    <div class="sec-desc"><p>{e(s['description'])}</p>
      <p class="sec-folder"><a href="{e(folder_href(s['folder']))}" rel="noopener">{e(s['folder'])}{ARROW}</a>{count_label}</p></div>
  </header>"""


def expected(s):
    if not s.get("expected"):
        return ""
    rows = "".join(f'<li><span class="x-l">{e(x["label"])}</span><span class="x-d">{e(x["due"])}</span></li>'
                   for x in s["expected"])
    return f'<div class="grid block"><h3 class="lbl">Due</h3><ul class="due">{rows}</ul></div>'


def brief_rows(m):
    out = []
    for r in m["brief"]:
        right = ""
        if r.get("quote"):
            mid = f'<blockquote class="bq">“{e(r["quote"])}”</blockquote>'
            right = f'<p>{e(r["body"])}</p>' if r.get("body") else ""
            out.append(f'<div class="grid brow brow-q"><h3 class="lbl">{e(r["label"])}</h3>{mid}<div class="b-body">{right}</div></div>')
            continue
        if r.get("steps"):
            steps = "".join(f'<li><span class="big">{i}</span><span>{e(t)}</span></li>' for i, t in enumerate(r["steps"], 1))
            out.append(f'<div class="grid brow"><h3 class="lbl">{e(r["label"])}</h3>'
                       f'<p class="b-head">{e(r["headline"])}</p><ol class="steps">{steps}</ol></div>')
            continue
        body = f'<p>{e(r["body"])}</p>' if r.get("body") else ""
        if r.get("list"):
            body += "<ul class='dash'>" + "".join(f"<li>{e(x)}</li>" for x in r["list"]) + "</ul>"
        out.append(f'<div class="grid brow"><h3 class="lbl">{e(r["label"])}</h3>'
                   f'<p class="b-head">{e(r["headline"])}</p><div class="b-body">{body}</div></div>')
    return "".join(out)


def figures(files):
    imgs = [f for f in files if pathlib.Path(f["path"]).suffix.lower() in IMAGE_EXT]
    others = [f for f in files if f not in imgs]
    out = ""
    if imgs:
        figs = []
        for i, f in enumerate(imgs, 1):
            size = image_size(ROOT / f["path"])
            wh = f' width="{size[0]}" height="{size[1]}"' if size else ""
            figs.append(f'<figure><a href="{e(href(f["path"]))}"><img src="{e(f["path"])}"{wh} loading="lazy" '
                        f'alt="{e(f.get("caption", ""))}"></a><figcaption><span>{i:02d}</span>'
                        f'{e(f.get("caption", ""))}</figcaption></figure>')
        out += f'<div class="figs">{"".join(figs)}</div>'
    if others:
        rows = []
        for f in others:
            fp = ROOT / f["path"]
            size = human(fp.stat().st_size) if fp.exists() else "missing"
            rows.append(f'<li><a href="{e(href(f["path"]))}">{e(f["path"])}</a>'
                        f'<span>{e(f.get("caption", ""))}</span><span class="sz">{size}</span></li>')
        out += f'<ul class="flist">{"".join(rows)}</ul>'
    return out


def entry(x):
    tag = f' <span class="tagline">{e(x["tagline"])}</span>' if x.get("tagline") else ""
    title = f'{e(x["title"])}{" —" if tag else ""}{tag}'
    if x.get("source", {}).get("url"):
        title = f'<a href="{e(x["source"]["url"])}" rel="noopener">{title}{ARROW}</a>'
    tag = ""
    meta = [f'<span class="id">{e(x["id"])}</span>']
    if x.get("date"):
        meta.append(f"<span>{e(d(x['date']))}</span>")
    if x.get("added_by"):
        meta.append(f"<span>Added by {e(x['added_by'])}</span>")
    if x.get("source", {}).get("name"):
        meta.append(f"<span>{e(x['source']['name'])}</span>")
    meta.append(status(x.get("status")))
    tags = ""
    if x.get("tags"):
        tags = f'<p class="tags">{e(", ".join(x["tags"]))}</p>'
    note = f'<p class="note">“{e(x["note"])}”{(" <span>" + e(x["added_by"]) + "</span>") if x.get("added_by") else ""}</p>' \
        if x.get("note") else ""
    rel = f'<div class="why"><h4 class="lbl">Why it’s here</h4><p>{e(x["relevance"])}</p></div>' if x.get("relevance") else ""
    els = ""
    if x.get("elements"):
        imgs = [f for f in x.get("files", []) if pathlib.Path(f["path"]).suffix.lower() in IMAGE_EXT]
        def fig(i):
            n = i.get("fig")
            if not n or n > len(imgs):
                return ""
            return f'<a href="{e(href(imgs[n - 1]["path"]))}">Fig. {n:02d}</a>'
        els = '<div class="els"><h4 class="lbl">Elements</h4><dl>' + "".join(
            f"<div><dt><span>{e(i['label'])}</span>{fig(i)}</dt><dd>{e(i['text'])}</dd></div>" for i in x["elements"]) + "</dl></div>"
    cap = f'<p class="fine">{e(x["capture"])}</p>' if x.get("capture") else ""
    sup = " superseded" if x.get("status") == "superseded" else ""
    return f"""<article class="grid entry{sup}" id="{e(x['id'])}">
    <div class="e-meta">{''.join(meta)}{tags}</div>
    <div class="e-main">
      <h3 class="e-title">{title}{tag}</h3>
      {note}
      {figures(x.get('files', []))}
      <div class="e-text">{rel}{els}</div>
      {cap}
    </div>
  </article>"""


def inputs_table(entries):
    rows = []
    for x in entries:
        files = x.get("files") or []
        f = "".join(f'<br><a href="{e(href(fl["path"]))}">{e(pathlib.Path(fl["path"]).name)}</a>' for fl in files)
        rows.append(f'<tr id="{e(x["id"])}"><td class="s2 id">{e(x["id"])}</td><td class="s3 main">{e(x["title"])}{f}</td>'
                    f'<td class="s2 mute">{e(x.get("from", ""))}</td><td class="s2 mute hide-s">{e(x.get("needed_for", ""))}</td>'
                    f'<td class="s1 stc">{status(x.get("status"))}</td></tr>')
    return f"""<table class="tbl inputs">
    <thead><tr><th class="s2">ID</th><th class="s3">Item</th><th class="s2">From</th><th class="s2">For</th><th class="s1">Status</th></tr></thead>
    <tbody>{''.join(rows)}</tbody></table>"""


def empty(text="None yet.", label="Entries"):
    return f'<div class="grid block"><h3 class="lbl">{e(label)}</h3><p class="empty">{e(text)}</p></div>'


def log_block(m, by_id):
    rows = []
    for x in sorted(m["log"], key=lambda r: r["date"], reverse=True):
        refs = []
        for r in x.get("refs", []):
            ent = by_id.get(r)
            target = (href(ent["files"][0]["path"]) if ent and ent.get("files")
                      else (ent or {}).get("source", {}).get("url", f"#{r}"))
            refs.append(f'<a href="{e(target)}">{e(r)}</a>')
        rows.append(f'<tr><td class="s2 dt">{e(d(x["date"]))}</td><td class="s5 main">{e(x["text"])}</td>'
                    f'<td class="s2 mute hide-s">{e(x["type"])}</td><td class="s1 refs">{" ".join(refs)}</td></tr>')
    return f"""<section class="sec" id="log" aria-labelledby="log-h">
  <header class="grid sec-head"><span class="sec-num"></span><h2 id="log-h">Log</h2>
    <div class="sec-desc"><p>Running record: drops, decisions, rounds, feedback. Newest first.</p></div></header>
  <table class="tbl log">
  <thead><tr><th class="s2">Date</th><th class="s5">Entry</th><th class="s2">Type</th><th class="s1">Refs</th></tr></thead>
  <tbody>{''.join(rows)}</tbody></table>
</section>"""


def files_block(files):
    groups: OrderedDict[str, list] = OrderedDict()
    for f in files:
        top = f["path"].split("/")[0] + "/" if "/" in f["path"] else "/"
        if f["path"].startswith(SITE_DIRS) or top == "/":
            top = "Site and tools"
        groups.setdefault(top, []).append(f)
    order = sorted(groups, key=lambda g: (g == "Site and tools", g))
    body = []
    for g in order:
        n = len(groups[g])
        body.append('<tbody class="fgroup">')
        for i, f in enumerate(groups[g]):
            label = f'<b>{e(g)}</b>{n} file{"s" if n != 1 else ""}' if i == 0 else ""
            body.append(f'<tr class="fr" data-p="{e(f["path"].lower())}"><td class="s2 g hide-s">{label}</td>'
                        f'<td class="s6 main"><a href="{e(href(f["path"]))}">{e(f["path"])}</a></td>'
                        f'<td class="s1 sz hide-s">{human(f["bytes"])}</td><td class="s1 dt mute">{e(d(f["date"], False))}</td></tr>')
        body.append("</tbody>")
    return f"""<section class="sec" id="files" aria-labelledby="files-h">
  <header class="grid sec-head"><span class="sec-num"></span><h2 id="files-h">Files</h2>
    <div class="sec-desc"><p>Every file in the repository, linked. Text sources open on GitHub.</p>
    <label class="search"><span class="vh">Filter files</span><input id="ff" type="search" placeholder="Filter files" autocomplete="off"></label></div></header>
  <table class="tbl files">
  <thead><tr><th class="s2">Folder</th><th class="s6">Path</th><th class="s1 sz">Size</th><th class="s1">Added</th></tr></thead>
  {''.join(body)}</table><p class="empty none" id="ff-none" hidden>No files match.</p>
</section>"""


SCRIPT = """<script>
(()=>{const links=[...document.querySelectorAll('.rail-nav a')];const map=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]));
const io=new IntersectionObserver(es=>{es.forEach(en=>{if(en.isIntersecting){links.forEach(a=>a.removeAttribute('aria-current'));const a=map.get(en.target.id);if(a){a.setAttribute('aria-current','true');a.scrollIntoView&&matchMedia('(max-width:1023px)').matches&&a.scrollIntoView({block:'nearest',inline:'center'})}}})},{rootMargin:'-30% 0px -65% 0px'});
document.querySelectorAll('section.sec[id]').forEach(s=>io.observe(s));
const f=document.getElementById('ff');if(f){const rows=[...document.querySelectorAll('tr.fr')],groups=[...document.querySelectorAll('tbody.fgroup')],none=document.getElementById('ff-none');
f.addEventListener('input',()=>{const q=f.value.trim().toLowerCase();let any=0;rows.forEach(r=>{const on=!q||r.dataset.p.includes(q);r.hidden=!on;any+=on});groups.forEach(g=>{g.hidden=![...g.querySelectorAll('tr.fr')].some(r=>!r.hidden)});none.hidden=!!any})}})();
</script>"""


# ---------------------------------------------------------------- page
def build(today: dt.date):
    m = json.loads(MANIFEST.read_text())
    files = repo_files()
    by_id = {x["id"]: x for x in m["entries"]}
    by_sec: dict[str, list] = {}
    for x in m["entries"]:
        by_sec.setdefault(x["section"], []).append(x)
    counts = {k: len(v) for k, v in by_sec.items()}
    counts["_files"] = len(files)

    s = m["project"]["sprint"]
    mon = dt.date.fromisoformat(s["week1_monday"])
    cur_week = (today - mon).days // 7 + 1
    if cur_week < 1:
        weekinfo = f"Starts {d(s['start'], False)}"
    elif cur_week > s["weeks"]:
        weekinfo = "Sprint complete"
    else:
        weekinfo = f"Week {cur_week} of {s['weeks']}"
    nxt = "—"
    for x in m["milestones"]:
        if x.get("date"):
            if dt.date.fromisoformat(x["date"]) > today:
                nxt = f"{x['label']}, {d(x['date'], False)}"
                break
        elif x["week"] > cur_week:
            nxt = f"{x['label']}, Wk {x['week']}"
            break
    updated = max([r["date"] for r in m["log"]] + [m["project"]["brief_source"]["date"]])

    secs = []
    for sec in m["sections"]:
        items = by_sec.get(sec["id"], [])
        if sec["id"] == "brief":
            src = m["project"]["brief_source"]
            body = (f'<div class="brief">{brief_rows(m)}</div>'
                    f'<div class="grid brow src"><h3 class="lbl">Source</h3><p class="b-head">'
                    f'{ext_link(src["url"], "Creative brief, Google Doc")}</p><div class="b-body"><p>'
                    f'<a href="{e(href(src["mirror"]))}">{e(src["mirror"])}</a> <span class="mute">text mirror, {e(d(src["date"]))}</span></p></div></div>')
            body += expected(sec)
        elif sec["id"] == "inputs":
            body = inputs_table(items) if items else empty("None yet.", "Inputs")
        else:
            label = {"references": "References", "notes": "Notes", "presentations": "Decks",
                     "handoff": "Delivered"}.get(sec["id"], "Rounds")
            body = expected(sec) + ("".join(entry(x) for x in items) if items else empty("None yet.", label))
        secs.append(f'<section class="sec" id="{sec["id"]}" aria-labelledby="{sec["id"]}-h">'
                    f'{sec_head(sec)}{body}</section>')

    p = m["project"]
    doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="robots" content="noindex, nofollow">
<title>{e(p['name'])} · Project manifest</title>
<link rel="preload" href="assets/site/fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%23000'/%3E%3C/svg%3E">
<link rel="stylesheet" href="assets/site/manifest.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="page">
{rail(m, counts, weekinfo, updated)}
<main id="main">
{masthead(m, weekinfo, nxt, counts, updated)}
{schedule(m, today, cur_week)}
{''.join(secs)}
{log_block(m, by_id)}
{files_block(files)}
<footer class="foot grid">
  <p>Generated from <a href="{e(href('data/manifest.json'))}">data/manifest.json</a> by <a href="{e(href('tools/build.py'))}">tools/build.py</a>. Built {e(d(today.isoformat()))}.</p>
  <p>Internal working document. {ext_link(REPO, 'github.com/jalulia/nkdpk')}</p>
</footer>
</main>
</div>
{SCRIPT}
</body>
</html>
"""
    OUT.write_text(doc)
    return len(files)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", help="YYYY-MM-DD; defaults to today in New York")
    a = ap.parse_args()
    if a.today:
        today = dt.date.fromisoformat(a.today)
    else:
        try:
            from zoneinfo import ZoneInfo
            today = dt.datetime.now(ZoneInfo("America/New_York")).date()
        except Exception:
            today = dt.date.today()
    n = build(today)
    print(f"index.html written · {n} files · as of {today}")
