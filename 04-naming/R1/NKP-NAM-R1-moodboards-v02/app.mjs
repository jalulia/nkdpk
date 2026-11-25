// R1 Naming Moodboards v02. Reads the published page from the nkdpk-pages function (falls back to
// content.json), and edits the draft in place in the owner's browser.
import {validatePage, safeURL} from './page-model.mjs';

const SLUG = 'r1-naming-moodboards';
const FN = 'https://ycolvxmvcmxfnuicgfay.supabase.co/functions/v1/';
const PAGES = FN + 'nkdpk-pages/' + SLUG;
const BOARDS = FN + 'nkdpk-boards';
const PINS = 'https://jalulia.github.io/nkdpk/assets/board-read/';
const SESSION = 'nkdpk.pages.editor.v1', DEVICE = 'nkdpk.browser.editor.v1', RECOVERY = 'nkdpk.pages.recovery.' + SLUG;

const $ = id => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid);
  return n;
}
const btn = (text, fn, cls = '') => h('button', {type: 'button', class: cls, onclick: fn}, text);
const uid = () => crypto.randomUUID();
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
const deviceKey = () => { try { return localStorage.getItem(DEVICE) || ''; } catch { return ''; } };
const plaintext = (() => { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only'; })();

let doc, revision = 0, publishedRevision = 0, token = '', backend = null;
let editing = false, previewing = false, previews = {}, pins = null;
let dirty = false, saving = false, conflict = false, saveError = '', seq = 0, timer = 0, retry = 0;
let undo = [], redo = [], toastTimer = 0, spy = null;
const canEdit = () => editing && !previewing;

/* ---------- network ---------- */
async function call(base, path = '', {method = 'GET', body, raw = false, again = true, timeout} = {}) {
  const headers = {};
  if (token) headers['x-editor-session'] = token;
  if (body !== undefined) headers['Content-Type'] = raw ? (body.type || 'application/octet-stream') : 'application/json';
  const res = await fetch(base + path, {method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(timeout || (raw ? 90000 : 25000))});
  const out = await res.json().catch(() => ({error: 'The server sent an unreadable response.'}));
  if (res.status === 401 && again && path !== '/unlock' && deviceKey()) { await unlock(deviceKey()); return call(base, path, {method, body, raw, again: false}); }
  if (!res.ok) { const e = Error(out.error || 'Could not save. Try again.'); e.status = res.status; e.conflict = res.status === 409; throw e; }
  return out;
}
async function unlock(key) {
  const r = await call(BOARDS, '/unlock', {method: 'POST', body: {key}, again: false});
  try { localStorage.setItem(DEVICE, key); } catch {}
  token = r.token; sessionStorage.setItem(SESSION, JSON.stringify(r));
}

/* ---------- render ---------- */
const keepNames = v => v.split(' · ').map(x => x.replace(/ /g, '\u00a0')).join(' · ');
function field(tag, path, cls, ph) {
  const raw = getPath(doc, path) || '', v = /\.(names|brands)$/.test(path) ? keepNames(raw) : raw;
  const n = h(tag, {class: (cls || '') + (v.trim() ? '' : ' empty')}, v);
  n.dataset.f = path; n.dataset.ph = ph || 'Add text';
  return n;
}
const imgSrc = i => (i.assetId && previews[i.assetId]) || i.src;
const wayLabel = (t, w) => `${t.number}${w.letter}`.trim();

function render({keepScroll = true} = {}) {
  const y = scrollY;
  document.title = (doc.title || 'Moodboards') + ' · NakedPak';
  const page = $('page');
  page.replaceChildren(cover(), ...doc.territories.map(territory), addTerritoryControl(), footer());
  layoutAll();
  bar();
  watch();
  applyEditable();
  if (keepScroll) scrollTo(0, y);
}

function cover() {
  return h('section', {class: 'wrap cover', id: 'top', 'aria-label': 'Introduction'},
    h('div', {class: 'cover-top'}, field('h1', 'title', 'title', 'Page title'), field('p', 'date', 'date', 'Date')),
    field('p', 'intro', 'intro', 'One or two plain sentences'));
}

function territory(t, ti) {
  const p = `territories.${ti}`;
  const name = field('span', p + '.name', 'name', 'Territory name');
  return h('section', {class: 'wrap territory', id: t.id, 'aria-labelledby': t.id + '-name'},
    h('header', {class: 'grid t-head'},
      h('h2', {class: 't-title', id: t.id + '-name'}, field('span', p + '.number', 'code', '00'), ' ', name),
      h('div', {class: 't-text'}, field('p', p + '.summary', 't-summary', 'One line on the territory'),
        h('p', {class: 'meta'}, field('span', 'labels.names', 'k', 'Label'), ' ', field('span', p + '.names', '', 'Names, separated by ·')))),
    h('div', {class: 'ctl'},
      btn('Add board', () => change(() => t.ways.push(newWay(t)))),
      btn('Move territory up', () => change(() => move(doc.territories, ti, ti - 1))),
      btn('Move territory down', () => change(() => move(doc.territories, ti, ti + 1))),
      btn('Delete territory', async () => { if (await ask('Delete this territory?', `${t.name || 'This territory'} and its ${t.ways.length} boards leave the draft. Undo brings them back.`)) change(() => doc.territories.splice(ti, 1)); }, 'danger')),
    t.ways.map((w, wi) => way(t, ti, w, wi)));
}

function way(t, ti, w, wi) {
  const p = `territories.${ti}.ways.${wi}`;
  const board = h('div', {class: 'board', role: 'list', 'aria-label': `${w.title} images`});
  board.dataset.way = w.id;
  w.images.forEach((img, ii) => board.append(tile(t, w, img, ii)));
  if (!w.images.length) board.append(h('p', {class: 'board-empty'}, canEdit() ? 'No images yet. Add pins, upload, or drop files here.' : 'No images yet.'));
  boardDrop(board, w);
  return h('article', {class: 'way', id: w.id, 'aria-labelledby': w.id + '-t'},
    h('header', {class: 'grid w-head'},
      h('h3', {class: 'w-title', id: w.id + '-t'}, h('span', {class: 'code'}, wayLabel(t, w)), ' ', field('span', p + '.title', 'name', 'Board name')),
      h('div', {class: 'w-text'}, field('p', p + '.note', 'w-note', 'One line on what to take from it'),
        h('p', {class: 'meta'}, field('span', 'labels.brands', 'k', 'Label'), ' ', field('span', p + '.brands', '', 'Brands')))),
    h('div', {class: 'ctl'},
      h('span', {class: 'ctl-letter'}, 'Letter ', field('span', p + '.letter', '', 'A')),
      btn('Add pins', () => openPicker({way: w})),
      btn('Upload images', () => pickFiles(w)),
      btn('Add image by URL', () => addByURL(w)),
      btn(w.lead ? 'Lead image: on' : 'Lead image: off', () => change(() => { w.lead = !w.lead; })),
      btn('Move up', () => change(() => moveWay(ti, wi, -1))),
      btn('Move down', () => change(() => moveWay(ti, wi, 1))),
      btn('Delete board', async () => { if (await ask('Delete this board?', `${w.title || 'This board'} and its ${w.images.length} images leave the draft. Undo brings them back.`)) change(() => t.ways.splice(wi, 1)); }, 'danger')),
    board);
}

function tile(t, w, img, ii) {
  const lead = w.lead && ii === 0;
  const node = h('div', {class: 'tile' + (img.fit === 'contain' ? ' contain' : '') + (lead ? ' lead-mark' : ''), role: 'listitem'});
  node.dataset.id = img.id;
  const im = h('img', {alt: img.alt || img.caption || 'Reference image', loading: 'lazy', decoding: 'async', class: 'loading'});
  im.style.objectPosition = `${img.fx}% ${img.fy}%`;
  im.addEventListener('load', () => im.classList.remove('loading'));
  im.addEventListener('error', () => { if (img.thumb && im.src !== img.thumb) im.src = img.thumb; else { im.classList.remove('loading'); node.classList.add('broken'); } });
  im.src = imgSrc(img);
  const open = h('button', {type: 'button', class: 'tile-open', 'aria-label': (canEdit() ? 'Edit image: ' : 'Open image: ') + (img.caption || img.alt || 'reference')},
    im, h('span', {class: 'tile-cap'}, img.pin ? h('b', {}, img.pin) : null, img.caption));
  open.addEventListener('click', () => canEdit() ? openImage(w, img) : openLightbox(t, w, ii));
  node.append(open);
  if (canEdit()) {
    node.append(h('div', {class: 'tile-tools'},
      btn('←', () => change(() => move(w.images, ii, ii - 1))),
      btn('→', () => change(() => move(w.images, ii, ii + 1))),
      ii ? btn('Lead', () => change(() => { move(w.images, ii, 0); w.lead = true; })) : null,
      btn('Edit', () => openImage(w, img)),
      btn('Remove', () => change(() => w.images.splice(ii, 1)))));
    node.draggable = true;
    node.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-nkdpk-image', JSON.stringify({way: w.id, id: img.id})); e.dataTransfer.effectAllowed = 'move'; node.classList.add('dragging'); });
    node.addEventListener('dragend', () => document.querySelectorAll('.dragging,.drag-over').forEach(n => n.classList.remove('dragging', 'drag-over')));
    node.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-nkdpk-image')) { e.preventDefault(); node.classList.add('drag-over'); } });
    node.addEventListener('dragleave', () => node.classList.remove('drag-over'));
    node.addEventListener('drop', e => {
      const raw = e.dataTransfer.getData('application/x-nkdpk-image'); if (!raw) return;
      e.preventDefault(); e.stopPropagation(); node.classList.remove('drag-over');
      const d = JSON.parse(raw); if (d.id === img.id) return;
      change(() => {
        const from = findWay(d.way), at = w.images.findIndex(i => i.id === img.id);
        const k = from ? from.images.findIndex(i => i.id === d.id) : -1; if (k < 0) return;
        const [moved] = from.images.splice(k, 1);
        w.images.splice(from === w && k < at ? at - 1 : at, 0, moved);
      });
    });
  }
  return node;
}

function addTerritoryControl() {
  return h('div', {class: 'wrap'}, h('div', {class: 'ctl ctl-add'}, btn('Add territory', () => change(() => {
    const n = doc.territories.length + 1, t = {id: uid(), number: String(n).padStart(2, '0'), name: '', summary: '', names: '', ways: []};
    t.ways.push(newWay(t)); doc.territories.push(t);
  }))));
}
function footer() {
  return h('footer', {class: 'wrap'}, h('nav', {class: 'foot', 'aria-label': 'Related'},
    h('a', {href: '../../../'}, 'Project index'),
    h('a', {href: '../../../boards/'}, 'Visual boards'),
    h('a', {href: '../../../07-presentations/2026-11-24-board-read-v08/index.html'}, 'Board read v08'),
    h('a', {href: 'https://www.pinterest.com/juliacompton/nkdpk/', target: '_blank', rel: 'noopener noreferrer'}, 'Pinterest board')));
}

/* ---------- justified boards ---------- */
const clampA = (a, fit) => Math.min(fit === 'contain' ? 2.8 : 2.4, Math.max(0.56, a || 1));
function rowsFor(items, widthOf, H, g) {
  // Optimal line breaks: each row is scaled to its width; cost is distance from the target height.
  const n = items.length, memo = new Map();
  const best = (i, r) => {
    if (i >= n) return {cost: 0, rows: []};
    const key = i + ':' + Math.min(r, 2); if (memo.has(key) && r >= 2) return memo.get(key);
    let out = null;
    for (let j = i + 1; j <= n && j - i <= 7; j++) {
      const slice = items.slice(i, j), W = widthOf(r);
      const sum = slice.reduce((s, x) => s + x.a, 0), hgt = (W - g * (slice.length - 1)) / sum;
      let cost = ((hgt - H) / H) ** 2;
      if (hgt > H * 1.7) cost += 4; if (hgt < H * 0.55) cost += 4;
      if (slice.length === 1 && n - i > 1) cost += 0.5;
      const rest = best(j, r + 1); cost += rest.cost;
      if (!out || cost < out.cost) out = {cost, rows: [{items: slice, h: hgt}, ...rest.rows]};
    }
    if (r >= 2) memo.set(key, out);
    return out;
  };
  return best(0, 0).rows;
}
function layoutBoard(board) {
  const w = findWay(board.dataset.way); if (!w) return;
  const tiles = [...board.querySelectorAll(':scope > .tile')]; if (!tiles.length) { board.style.height = ''; return; }
  const W = board.clientWidth, narrow = W < 700, g = narrow ? 4 : 8;
  const H = narrow ? Math.max(120, W * 0.42) : Math.max(190, Math.min(330, W * 0.205));
  const items = w.images.map((img, i) => ({a: clampA(img.aspect, img.fit), node: tiles[i]}));
  const place = (node, x, y, ww, hh) => Object.assign(node.style, {left: x + 'px', top: y + 'px', width: Math.max(1, ww) + 'px', height: Math.max(1, hh) + 'px'});
  let y = 0, rest = items, heroW = 0, heroH = 0;
  if (w.lead && items.length >= 4 && !narrow) {
    const a0 = items[0].a; rest = items.slice(1);
    const maxW = W * (a0 > 1.3 ? 0.58 : 0.5), minW = W * 0.3;
    heroW = Math.min(maxW, Math.max(minW, a0 * (2 * H + g)));
    let rows;
    for (let k = 0; k < 4; k++) {
      rows = rowsFor(rest, r => r < 2 ? W - heroW - g : W, H, g);
      heroH = rows.length > 1 ? rows[0].h + rows[1].h + g : (rows[0]?.h || H);
      heroW = Math.min(maxW, Math.max(minW, a0 * heroH));
    }
    rows = rowsFor(rest, r => r < 2 ? W - heroW - g : W, H, g);
    heroH = rows.length > 1 ? rows[0].h + rows[1].h + g : (rows[0]?.h || H);
    place(items[0].node, 0, 0, heroW, heroH);
    rows.forEach((row, r) => {
      const x0 = r < 2 ? heroW + g : 0, rw = r < 2 ? W - heroW - g : W;
      let x = x0; const hh = Math.round(row.h);
      row.items.forEach((it, k) => { const last = k === row.items.length - 1, ww = last ? x0 + rw - x : Math.round(it.a * row.h); place(it.node, x, y, ww, hh); x += ww + g; });
      y += hh + g;
    });
    y = Math.max(y - g, heroH);
  } else {
    if (w.lead && narrow) {
      const a0 = Math.min(1.6, Math.max(0.8, items[0].a)), hh = Math.round(W / a0);
      place(items[0].node, 0, 0, W, hh); y = hh + g; rest = items.slice(1);
    }
    for (const row of rowsFor(rest, () => W, H, g)) {
      let x = 0; const hh = Math.round(row.h);
      row.items.forEach((it, k) => { const last = k === row.items.length - 1, ww = last ? W - x : Math.round(it.a * row.h); place(it.node, x, y, ww, hh); x += ww + g; });
      y += hh + g;
    }
    y -= g;
  }
  board.style.height = Math.max(0, Math.round(y)) + 'px';
}
function layoutAll() { document.querySelectorAll('.board').forEach(layoutBoard); }
let lastW = 0;
new ResizeObserver(() => { const w = $('page').clientWidth; if (w !== lastW) { lastW = w; requestAnimationFrame(layoutAll); } }).observe($('page'));

/* ---------- bar + scroll spy ---------- */
function bar() {
  const nav = $('bar-nav'); nav.replaceChildren();
  doc.territories.forEach(t => {
    nav.append(h('a', {href: '#' + t.id, 'data-t': t.id}, h('span', {class: 'num'}, t.number), t.name || 'Untitled'));
    nav.append(h('span', {class: 'bar-ways', 'data-ways': t.id, hidden: true}, t.ways.map(w => h('a', {href: '#' + w.id, 'data-w': w.id}, w.letter, h('span', {class: 'bar-way-name'}, ' ' + w.title)))));
  });
}
function setActive(tid, wid) {
  document.querySelectorAll('#bar-nav [data-t]').forEach(a => a.setAttribute('aria-current', String(a.dataset.t === tid)));
  document.querySelectorAll('#bar-nav [data-ways]').forEach(s => s.hidden = s.dataset.ways !== tid);
  document.querySelectorAll('#bar-nav [data-w]').forEach(a => a.setAttribute('aria-current', String(a.dataset.w === wid)));
  const t = doc.territories.find(x => x.id === tid), w = t?.ways.find(x => x.id === wid);
  $('bar-now').textContent = w ? `${wayLabel(t, w)} ${w.title}` : t ? `${t.number} ${t.name}` : (doc.title || '');
}
function watch() {
  spy?.disconnect();
  const seen = new Map();
  spy = new IntersectionObserver(entries => {
    for (const e of entries) seen.set(e.target, e.isIntersecting);
    let tid = '', wid = '';
    for (const [n, on] of seen) if (on) { if (n.classList.contains('territory')) tid = n.id; else { wid = n.id; tid = n.closest('.territory').id; } }
    setActive(tid, wid);
  }, {rootMargin: '-40% 0px -55% 0px'});
  document.querySelectorAll('.territory,.way').forEach(n => spy.observe(n));
  setActive('', '');
}

/* ---------- lightbox ---------- */
let lb = {t: null, w: null, i: 0};
function openLightbox(t, w, i) { lb = {t, w, i}; showLight(); if (!$('lightbox').open) { $('lightbox').showModal(); $('lightbox').focus(); } }
function showLight() {
  const {t, w} = lb, n = w.images.length; lb.i = (lb.i + n) % n;
  const img = w.images[lb.i];
  $('lb-where').textContent = `${wayLabel(t, w)} ${w.title} · ${t.name}`;
  $('lb-count').textContent = `${lb.i + 1} / ${n}`;
  $('lb-img').src = imgSrc(img); $('lb-img').alt = img.alt || img.caption || '';
  $('lb-cap').textContent = (img.pin ? 'Pin ' + img.pin + '. ' : '') + (img.caption || '');
  $('lb-link').hidden = !img.href; if (img.href) { $('lb-link').href = img.href; $('lb-link').textContent = /pinterest\./.test(img.href) ? 'View pin ↗' : 'View source ↗'; }
  [w.images[lb.i + 1], w.images[lb.i - 1]].forEach(x => { if (x) new Image().src = imgSrc(x); });
}
$('lb-prev').onclick = () => { lb.i--; showLight(); };
$('lb-next').onclick = () => { lb.i++; showLight(); };
$('lb-fig').addEventListener('click', e => { if (e.target === $('lb-fig')) $('lightbox').close(); });
$('lightbox').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { lb.i--; showLight(); } if (e.key === 'ArrowRight') { lb.i++; showLight(); } });
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

/* ---------- editing: text ---------- */
function applyEditable() {
  document.querySelectorAll('[data-f]').forEach(n => {
    if (canEdit()) { n.contentEditable = plaintext ? 'plaintext-only' : 'true'; n.spellcheck = true; }
    else n.removeAttribute('contenteditable');
  });
}
const page = $('page');
page.addEventListener('focusin', e => { const f = e.target.closest?.('[data-f]'); if (f && canEdit()) f._snap = JSON.stringify(doc); });
page.addEventListener('input', e => {
  const f = e.target.closest?.('[data-f]'); if (!f || !canEdit()) return;
  if (f._snap) { undo.push(f._snap); if (undo.length > 100) undo.shift(); redo = []; f._snap = null; }
  const text = f.innerText.replace(/ /g, ' ').replace(/\s*\n+\s*/g, ' ');
  setPath(doc, f.dataset.f, text.trim());
  f.classList.toggle('empty', !text.trim());
  if (/^territories\.\d+\.(name|number)$|ways\.\d+\.(title|letter)$/.test(f.dataset.f)) { bar(); syncCodes(); }
  markChanged();
});
page.addEventListener('keydown', e => { const f = e.target.closest?.('[data-f]'); if (f && canEdit() && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); f.blur(); } });
page.addEventListener('paste', e => {
  const f = e.target.closest?.('[data-f]'); if (!f || !canEdit() || plaintext) return;
  e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
});
page.addEventListener('focusout', e => { const f = e.target.closest?.('[data-f]'); if (f && canEdit()) { const v = getPath(doc, f.dataset.f) || ''; if (f.textContent !== v) f.textContent = v; } });

function syncCodes() { doc.territories.forEach(t => t.ways.forEach(w => { const c = document.querySelector(`#${CSS.escape(w.id)} .w-title .code`); if (c) c.textContent = wayLabel(t, w); })); }

/* ---------- editing: structure ---------- */
function move(list, from, to) { if (to < 0 || to >= list.length || from === to) return; const [x] = list.splice(from, 1); list.splice(to, 0, x); }
function moveWay(ti, wi, dir) {
  const ways = doc.territories[ti].ways, to = wi + dir;
  if (to >= 0 && to < ways.length) return move(ways, wi, to);
  const tt = ti + dir; if (tt < 0 || tt >= doc.territories.length) return;
  const [w] = ways.splice(wi, 1); const target = doc.territories[tt].ways;
  dir < 0 ? target.push(w) : target.unshift(w);
}
function newWay(t) { const letter = String.fromCharCode(65 + t.ways.length); return {id: uid(), letter, title: '', note: '', brands: '', lead: true, images: []}; }
const findWay = id => { for (const t of doc.territories) for (const w of t.ways) if (w.id === id) return w; return null; };
function snapshot() { undo.push(JSON.stringify(doc)); if (undo.length > 100) undo.shift(); redo = []; }
function change(fn, {snap = true} = {}) { if (!canEdit()) return; if (snap) snapshot(); fn(); markChanged(); render(); }
function usedPins() { const m = new Map(); for (const t of doc.territories) for (const w of t.ways) for (const i of w.images) if (i.pin) m.set(i.pin, wayLabel(t, w)); return m; }
function freeId(base) { const ids = new Set(); for (const t of doc.territories) for (const w of t.ways) for (const i of w.images) ids.add(i.id); return ids.has(base) ? uid() : base; }
const fromPin = p => ({id: freeId('p' + p.pin), pin: p.pin, src: PINS + 'plates/' + p.pin + '.jpg', thumb: PINS + 'thumbs/' + p.pin + '.jpg', href: p.href,
  caption: p.what, alt: p.what, aspect: p.aspect, fit: 'cover', fx: 50, fy: 50});

/* ---------- autosave ---------- */
function markChanged() {
  dirty = true; seq++; saveError = '';
  try { localStorage.setItem(RECOVERY, JSON.stringify({document: doc, revision, at: Date.now()})); } catch {}
  sync(); clearTimeout(timer); timer = setTimeout(() => void flush(), 800);
}
async function flush() {
  clearTimeout(timer);
  if (saving) { while (saving) await new Promise(r => setTimeout(r, 60)); return !dirty && !conflict; }
  if (!dirty) return true; if (conflict || !token) return false;
  saving = true; sync();
  try {
    while (dirty && !conflict) {
      const s = seq, candidate = validatePage(doc);
      const r = await call(PAGES, '/draft', {method: 'POST', body: {revision, document: candidate}});
      revision = r.revision; publishedRevision = r.publishedRevision;
      if (s === seq) { dirty = false; try { localStorage.removeItem(RECOVERY); } catch {} }
    }
    saveError = ''; return true;
  } catch (e) {
    conflict = !!e.conflict; saveError = e.status === 401 ? 'Session ended. Reload to edit.' : e.message;
    if (conflict) toast('A newer draft was saved elsewhere. Your changes are kept in this browser. Export them, or reload to get the latest.', 0);
    else if (e.status !== 400 && e.status !== 401) { clearTimeout(retry); retry = setTimeout(() => void flush(), 15000); }
    return false;
  } finally { saving = false; sync(); }
}
async function publish() {
  if (!await flush()) return;
  $('publish').disabled = true;
  try {
    const r = await call(PAGES, '/publish', {method: 'POST', body: {revision, document: validatePage(doc)}});
    revision = r.revision; publishedRevision = r.publishedRevision; toast('Published. Everyone with the link now sees this version.');
  } catch (e) { conflict = !!e.conflict; saveError = e.message; toast(e.message); }
  finally { sync(); }
}
function sync() {
  const show = editing || !!token || !!deviceKey();
  $('edit').hidden = !show || editing;
  $('editbar').hidden = !editing;
  document.body.classList.toggle('editing', editing);
  document.body.classList.toggle('previewing', previewing);
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
  $('preview').textContent = previewing ? 'Back to editing' : 'Preview';
  $('publish').disabled = saving || conflict || dirty || revision === publishedRevision;
  const s = conflict ? 'A newer draft exists' : saveError ? saveError : saving ? 'Saving…' : dirty ? 'Unsaved changes' : revision === publishedRevision ? 'Published' : 'Draft saved, not published';
  $('eb-status').textContent = s; $('eb-status').classList.toggle('error', !!saveError || conflict);
  $('status').textContent = !editing && token && revision !== publishedRevision && revision ? 'Draft not published' : '';
}

/* ---------- start / stop editing ---------- */
async function startEditing() {
  if (backend === false) { toast('Editing is not connected yet: the page service is not set up.'); return; }
  $('edit').disabled = true;
  try {
    if (!token) await unlock(deviceKey());
    const d = await call(PAGES, '/draft');
    doc = validatePage(d.document); revision = d.revision; publishedRevision = d.publishedRevision; previews = d.previews || {};
    try {
      const saved = JSON.parse(localStorage.getItem(RECOVERY) || 'null');
      if (saved?.revision === revision && JSON.stringify(saved.document) !== JSON.stringify(doc) &&
        await ask('Restore unsaved changes?', 'This browser kept edits that did not reach the server. Restore them into the draft?')) { doc = validatePage(saved.document); dirty = true; }
      else if (saved) localStorage.removeItem(RECOVERY);
    } catch {}
    editing = true; undo = []; redo = []; render(); sync(); if (dirty) markChanged();
    toast('Editing the draft. Click any text to change it. Publish makes changes public.');
  } catch (e) { toast(e.status === 401 ? 'This browser cannot edit the page.' : e.message); }
  finally { $('edit').disabled = false; }
}
async function stopEditing() { await flush(); editing = false; previewing = false; render(); sync(); }
$('edit').onclick = startEditing;
$('done').onclick = stopEditing;
$('publish').onclick = publish;
$('preview').onclick = () => { previewing = !previewing; render(); sync(); };
$('undo').onclick = () => { if (!undo.length) return; redo.push(JSON.stringify(doc)); doc = JSON.parse(undo.pop()); markChanged(); render(); };
$('redo').onclick = () => { if (!redo.length) return; undo.push(JSON.stringify(doc)); doc = JSON.parse(redo.pop()); markChanged(); render(); };
document.addEventListener('keydown', e => {
  if (!canEdit() || !(e.metaKey || e.ctrlKey) || e.target.closest?.('[data-f],input,textarea')) return;
  if (e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('redo') : $('undo')).click(); }
});
addEventListener('beforeunload', e => { if (dirty) { void flush(); e.preventDefault(); } });

/* ---------- export / import / versions ---------- */
$('export').onclick = () => {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const a = h('a', {href: URL.createObjectURL(new Blob([JSON.stringify(validatePage(doc), null, 1)], {type: 'application/json'})), download: `nkdpk-${SLUG}-${stamp}.json`});
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const next = validatePage(JSON.parse(await file.text()));
    if (await ask('Replace the draft with this file?', `${file.name} replaces everything in the draft. Undo brings the current draft back.`)) change(() => { doc = next; });
  } catch (err) { toast('That file is not a moodboard page: ' + err.message); }
};
$('versions-open').onclick = async () => {
  const list = $('vs-list'); list.replaceChildren(h('p', {class: 'hint'}, 'Loading…')); $('versions').showModal();
  try {
    const rows = await call(PAGES, '/history');
    list.replaceChildren(...rows.map(r => h('div', {class: 'version-row'},
      h('span', {}, `Revision ${r.revision}${r.published ? ' · published' : ''}`, h('small', {}, new Date(r.created_at).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'}))),
      btn('Load into draft', async () => {
        const v = await call(PAGES, '/history/' + r.revision);
        $('versions').close(); Object.assign(previews, v.previews || {});
        change(() => { doc = validatePage(v.document); }); toast(`Revision ${r.revision} is now the draft.`);
      }))));
    if (!rows.length) list.replaceChildren(h('p', {class: 'hint'}, 'No saved versions yet.'));
  } catch (e) { list.replaceChildren(h('p', {class: 'hint'}, e.message)); }
};

/* ---------- images: dialog ---------- */
let current = null;
function openImage(w, img) {
  current = {w, img, snap: JSON.stringify(doc)};
  const i = img;
  $('id-img').src = imgSrc(i); $('id-pin').textContent = i.pin ? 'Pin ' + i.pin : (i.assetId ? 'Uploaded image' : 'Image from a link');
  $('id-caption').value = i.caption; $('id-alt').value = i.alt; $('id-href').value = i.href; $('id-fit').value = i.fit;
  dot(); $('imgdlg').showModal();
}
function dot() { const i = current.img; Object.assign($('id-dot').style, {left: i.fx + '%', top: i.fy + '%'}); }
function edited() { if (current?.snap) { undo.push(current.snap); if (undo.length > 100) undo.shift(); redo = []; current.snap = null; } markChanged(); }
$('imgdlg').addEventListener('close', () => { current = null; render(); });
$('id-caption').oninput = e => { current.img.caption = e.target.value; edited(); };
$('id-alt').oninput = e => { current.img.alt = e.target.value; edited(); };
$('id-href').onchange = e => { const u = safeURL(e.target.value.trim()); if (e.target.value.trim() && !u) { toast('Use a full https:// link.'); return; } current.img.href = u; edited(); };
$('id-fit').onchange = e => { current.img.fit = e.target.value; edited(); };
$('id-frame').addEventListener('click', e => {
  const r = $('id-img').getBoundingClientRect(); if (!r.width) return;
  current.img.fx = Math.round(Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)));
  current.img.fy = Math.round(Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100)));
  dot(); edited();
});
$('id-remove').onclick = () => { const {w, img} = current; edited(); w.images.splice(w.images.indexOf(img), 1); $('imgdlg').close(); };
$('id-lead').onclick = () => { const {w, img} = current; edited(); move(w.images, w.images.indexOf(img), 0); w.lead = true; $('imgdlg').close(); };
$('id-replace-pin').onclick = () => { const c = current; $('imgdlg').close(); openPicker({way: c.w, replace: c.img}); };
$('id-replace-file').onclick = () => { const c = current; $('imgdlg').close(); pickFiles(c.w, c.img); };

/* ---------- images: pin picker ---------- */
let pick = {way: null, replace: null, chosen: []};
async function openPicker({way, replace = null}) {
  pick = {way, replace, chosen: []};
  $('pk-title').textContent = replace ? 'Replace with a pin' : `Add pins to ${way.title}`;
  $('pk-search').value = ''; $('picker').showModal();
  if (!pins) { $('pk-grid').replaceChildren(h('p', {class: 'hint'}, 'Loading the nkdpk board…')); try { pins = await (await fetch('./pins.json')).json(); } catch { $('pk-grid').replaceChildren(h('p', {class: 'hint'}, 'The pin list did not load.')); return; } }
  drawPicker(); $('pk-search').focus();
}
function drawPicker() {
  const q = $('pk-search').value.trim().toLowerCase(), hide = $('pk-hide').checked, used = usedPins();
  const list = pins.filter(p => (!q || p.pin.includes(q) || p.what.toLowerCase().includes(q)) && !(hide && used.has(p.pin)));
  $('pk-grid').replaceChildren(...list.map(p => {
    const on = pick.chosen.includes(p.pin), where = used.get(p.pin);
    const b = h('button', {type: 'button', class: 'pk-item' + (where ? ' used' : ''), 'aria-pressed': String(on), title: p.what},
      h('img', {src: PINS + 'thumbs/' + p.pin + '.jpg', alt: '', loading: 'lazy', decoding: 'async'}),
      where ? h('em', {}, 'On page · ' + where) : p.dup.length ? h('em', {}, 'Same image as ' + p.dup.join(', ')) : null,
      h('span', {}, h('b', {}, p.pin + ' '), p.what));
    b.onclick = () => {
      if (pick.replace) pick.chosen = on ? [] : [p.pin];
      else pick.chosen = on ? pick.chosen.filter(x => x !== p.pin) : [...pick.chosen, p.pin];
      drawPicker();
    };
    return b;
  }));
  const n = pick.chosen.length;
  $('pk-count').textContent = `${list.length} of ${pins.length} pins${n ? ` · ${n} selected` : ''}`;
  $('pk-add').disabled = !n; $('pk-add').textContent = pick.replace ? 'Replace' : n > 1 ? `Add ${n} pins` : 'Add pin';
}
$('pk-search').oninput = drawPicker; $('pk-hide').onchange = drawPicker;
$('pk-add').onclick = () => {
  const chosen = pick.chosen.map(n => pins.find(p => p.pin === n)).filter(Boolean), {way, replace} = pick;
  $('picker').close();
  change(() => {
    if (replace) { const k = way.images.indexOf(replace); if (k >= 0) way.images[k] = {...fromPin(chosen[0]), id: replace.id}; }
    else for (const p of chosen) way.images.push(fromPin(p));
  });
  toast(replace ? 'Image replaced.' : `${chosen.length} ${chosen.length === 1 ? 'pin' : 'pins'} added to ${way.title}.`);
};

/* ---------- images: uploads and links ---------- */
let uploadTarget = null;
function pickFiles(w, replace = null) { uploadTarget = {w, replace}; $('files').click(); }
$('files').onchange = e => { const files = [...e.target.files]; e.target.value = ''; if (uploadTarget && files.length) void upload(files, uploadTarget.w, uploadTarget.replace); };
function boardDrop(board, w) {
  if (!canEdit()) return;
  board.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); board.classList.add('file-over'); } });
  board.addEventListener('dragleave', e => { if (!board.contains(e.relatedTarget)) board.classList.remove('file-over'); });
  board.addEventListener('drop', e => { board.classList.remove('file-over'); if (!e.dataTransfer.files.length) return; e.preventDefault(); void upload([...e.dataTransfer.files], w); });
}
async function measure(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth / i.naturalHeight || 1); i.onerror = () => res(0); i.src = src; }); }
async function upload(files, w, replace = null) {
  const ok = files.filter(f => /^image\/(jpeg|png|webp|gif)$/.test(f.type) && f.size <= 10485760);
  if (ok.length < files.length) toast('Some files were skipped: use JPG, PNG, WebP or GIF under 10 MB.');
  if (!ok.length) return;
  snapshot();
  for (const [k, f] of ok.entries()) {
    toast(`Uploading ${k + 1} of ${ok.length}…`, 0);
    try {
      const aspect = await measure(URL.createObjectURL(f));
      const r = await call(BOARDS, '/upload', {method: 'POST', body: f, raw: true});
      previews[r.assetId] = r.preview;
      const img = {id: uid(), assetId: r.assetId, pin: '', src: r.src, thumb: '', href: '', caption: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '), alt: '', aspect: aspect || 1, fit: 'cover', fx: 50, fy: 50};
      if (replace) { const i = w.images.indexOf(replace); if (i >= 0) w.images[i] = {...img, id: replace.id}; replace = null; }
      else w.images.push(img);
      markChanged(); render();
    } catch (err) { toast(`${f.name}: ${err.message}`); return; }
  }
  toast(ok.length === 1 ? 'Image added.' : `${ok.length} images added.`);
}
async function addByURL(w) {
  const raw = await ask('Add an image by link', 'Paste a direct https:// link to a JPG, PNG, WebP or GIF.', {field: 'Image link'});
  if (!raw) return;
  const src = safeURL(raw.trim(), {image: true}); if (!src) { toast('Use a full https:// image link.'); return; }
  const aspect = await measure(src); if (!aspect) { toast('That link did not load as an image.'); return; }
  change(() => w.images.push({id: uid(), pin: '', src, thumb: '', href: src, caption: '', alt: '', aspect, fit: 'cover', fx: 50, fy: 50}));
}

/* ---------- small UI ---------- */
function toast(msg, ms = 4200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => t.hidden = true, ms); }
function ask(title, copy, {field: label} = {}) {
  const d = $('ask'); $('ask-title').textContent = title; $('ask-copy').textContent = copy;
  $('ask-field').hidden = !label; $('ask-field-label').textContent = label || ''; $('ask-input').value = '';
  $('ask-ok').textContent = label ? 'Add' : 'Continue'; d.returnValue = ''; d.showModal(); if (label) $('ask-input').focus();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'ok' ? (label ? $('ask-input').value : true) : false), {once: true}));
}

$('ask-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('ask').close('ok'); } });

/* ---------- start ---------- */
async function init() {
  let key = '';
  if (location.hash.startsWith('#edit=')) { key = decodeURIComponent(location.hash.slice(6)); history.replaceState(null, '', location.pathname); }
  try { const s = JSON.parse(sessionStorage.getItem(SESSION) || 'null'); if (s?.expiresAt > Date.now()) token = s.token; } catch {}
  try {
    const r = await call(PAGES, '', {again: false, timeout: 8000});
    doc = validatePage(r.document); revision = publishedRevision = r.revision; backend = true;
  } catch (e) {
    backend = e.status && e.status !== 404 ? null : false;
    try { doc = validatePage(await (await fetch('./content.json', {cache: 'no-cache'})).json()); }
    catch { $('page').replaceChildren(h('p', {class: 'loading'}, 'The moodboards did not load. Refresh to try again.')); return; }
  }
  render({keepScroll: false}); sync();
  if (location.hash.length > 1) { const target = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (target) requestAnimationFrame(() => target.scrollIntoView()); }
  if (key) { try { await unlock(key); sync(); toast('This browser can now edit the page. Click Edit.'); } catch (e) { toast(e.message); } }
}
void init();
