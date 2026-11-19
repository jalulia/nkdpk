#!/usr/bin/env python3
"""Build the project index from data/manifest.json. No third-party dependencies."""
import argparse
import datetime
import html
import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
REPO = 'https://github.com/jalulia/nkdpk'
FOLDERS = REPO + '/tree/main/'
LABELS = {'inputs': 'Naama’s inputs', 'notes': 'Conversations', 'references': 'Visual references',
          'brief': 'Project brief', 'naming': 'Naming', 'presentations': 'Presentations'}


def esc(value):
    return html.escape(str(value), quote=True)


def link(url, name):
    return f'<a href="{esc(url)}">{esc(name)}</a>'


def file_link(item):
    path = item['path']
    url = REPO + '/blob/main/' + quote(path) if path.endswith(('.md', '.json', '.txt')) else quote(path)
    return link(url, item.get('caption') or Path(path).name)


def record(item):
    source = item.get('source', {})
    title = link(source['url'], item['title']) if source.get('url') else esc(item['title'])
    desc = item.get('description', '')
    category = item.get('category') or item['kind'].capitalize()
    kind = source.get('name', '')
    if item.get('project_path'):
        location = 'NkdPk/' + item['project_path']
        details = f'<details><summary>Project folder</summary><code>{esc(location)}</code></details>'
    else:
        details = ''
    if item.get('review_route'):
        details = link('review/index.html?open=' + quote(item['review_route'], safe='/'), 'Open catalog record') + details
    attachments = item.get('files', [])
    if attachments:
        links = ''.join(f'<li>{file_link(f)}</li>' for f in attachments)
        elements = ''.join(f'<p><b>{esc(el["label"])}</b> · {esc(el["text"])}</p>' for el in item.get('elements', []))
        details += f'<details><summary>Files &amp; notes</summary><ul>{links}</ul>{elements}</details>'
    return (f'<article class="record" id="{esc(item["id"])}"><div class="category">{esc(category)}</div>'
            f'<div class="record-main"><h3>{title}</h3>{f"<p>{esc(desc)}</p>" if desc else ""}{details}</div>'
            f'<div class="record-id">{esc(item["id"])}{f"<small>{esc(kind)}</small>" if kind else ""}</div></article>')


def section(anchor, title, body):
    return f'<section id="{esc(anchor)}" class="index-section"><h2>{esc(title)}</h2>{body}</section>'


def log_block(manifest):
    days = defaultdict(list)
    for event in manifest['log']:
        days[event['date']].append(event)
    output = []
    for day in sorted(days, reverse=True):
        events = []
        for entry in days[day]:
            refs = ' '.join(link('#' + ref, ref) for ref in entry.get('refs', []))
            events.append(f'<li>{esc(entry["text"])} <small>{refs}</small></li>')
        date = datetime.date.fromisoformat(day).strftime('%b %d, %Y')
        output.append(f'<div class="logday"><time datetime="{esc(day)}">{date}</time><ul>{"".join(events)}</ul></div>')
    return section('log', 'Log', ''.join(output))


def build():
    manifest = json.loads((ROOT / 'data/manifest.json').read_text())
    sections = {s['id']: s for s in manifest['sections']}
    grouped = defaultdict(list)
    for item in manifest['entries']:
        grouped[item['section']].append(item)
    order = ['inputs', 'notes', 'brief', 'references', 'naming', 'presentations']
    order += [s for s in sections if s not in order]
    blocks = []
    nav = []

    def add(anchor, title, body):
        blocks.append(section(anchor, title, body))
        nav.append(link('#' + anchor, title))

    def project_file(label, path, description, metric):
        view = {'input-register': 'inputs', 'pin-catalog': 'ledger', 'board-study': 'board/1'}[metric]
        review = link('review/index.html?open=' + quote(view, safe='/'), label)
        return (f'<article class="record" data-metric="{esc(metric)}"><div class="category">Private review</div><div class="record-main">'
                f'<h3>{review}</h3><p>{esc(description)}</p><details><summary>File location</summary>'
                f'<code>NkdPk/{esc(path)}</code></details></div></article>')

    for key in order:
        items = grouped[key]
        if key == 'inputs':
            intake = project_file('Client input register', manifest['project']['private_register'],
                                  'Source files, meeting notes and outstanding questions.', 'input-register')
            historical = [i for i in items if i.get('status') == 'requested-at-kickoff']
            new = [i for i in items if i not in historical]
            if historical:
                intake += '<details class="prior"><summary>Original kickoff requests</summary>' + ''.join(record(i) for i in historical) + '</details>'
            add(key, 'Client inputs', intake + ''.join(record(i) for i in new))
        elif key == 'references':
            catalog = project_file('Pin catalog', manifest['project']['private_catalog'],
                                   '149 Pinterest pins and additional brand references.', 'pin-catalog')
            add(key, 'Visual references', catalog + ''.join(record(i) for i in items))
        elif key == 'presentations':
            study = project_file('NakedPak visual reference study', manifest['project']['private_study'],
                                 '41 boards on the product, visual references and design directions.', 'board-study')
            add(key, 'Presentations', study + ''.join(record(i) for i in items))
        elif items:
            add(key, LABELS.get(key, sections[key]['title']), ''.join(record(i) for i in items))

    archive = []
    for sid, settings in sections.items():
        anchor = f' id="{esc(sid)}"' if not grouped[sid] and sid not in ('inputs', 'references', 'presentations') else ''
        archive.append(f'<li{anchor}>{link(FOLDERS + settings["folder"], settings["folder"].rstrip("/"))}</li>')
    blocks += [log_block(manifest), section('files', 'Files', '<details><summary>Project folders</summary><ul class="folder-list">'
                                           + ''.join(archive) + '</ul></details>')]
    nav += [link('#log', 'Log'), link('#files', 'Files')]
    title = esc(manifest['project']['name'])
    doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="robots" content="noindex,nofollow">
<title>{title} · Project index</title><link rel="stylesheet" href="assets/site/manifest.css"><script defer src="assets/site/analytics.js"></script></head>
<body class="index"><a class="skip" href="#main">Skip to content</a><div class="index-shell">
<aside><a class="home" href="#top">{title}</a><div class="section-nav"><nav aria-label="Sections">{''.join(nav)}</nav></div>
{link(REPO, 'Repository ↗')}</aside><main id="main"><header id="top" class="index-mast"><p>ø co. &nbsp; / &nbsp; Project index</p>
<h1>{title}</h1><p>{esc(manifest['project']['intro'])}</p></header>{''.join(blocks)}</main></div></body></html>"""
    (ROOT / 'index.html').write_text(doc + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--today', type=datetime.date.fromisoformat, help=argparse.SUPPRESS)
    parser.parse_args()
    build()
    print('Built NakedPak project index.')
