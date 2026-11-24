// Shared by the page and the nkdpk-pages Edge Function. Keep the two copies identical.
export const VERSION = 1;
export const LABEL_KEYS = ['naming', 'visual', 'names', 'how', 'why', 'brands', 'quoteSource', 'contents', 'wayIn'];
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, n = 4000) => typeof v === 'string' ? v.slice(0, n) : '';
const num = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
export function safeURL(value, {image = false} = {}) {
  if (!value || typeof value !== 'string') return '';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    if (image && /[<>"'\s]/.test(value)) return '';
    return u.href;
  } catch { return ''; }
}
export function validatePage(input) {
  if (!plain(input) || input.version !== VERSION || !Array.isArray(input.territories) || input.territories.length > 8) throw Error('This is not a valid moodboard page.');
  const ids = new Set();
  const id = value => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value) || ids.has(value)) throw Error('Every item needs a unique ID.');
    ids.add(value); return value;
  };
  let total = 0;
  const image = i => {
    if (!plain(i) || ++total > 600) throw Error('This page has too many images.');
    const src = safeURL(i.src, {image: true});
    if (!src) throw Error('Images need a valid HTTPS source.');
    const assetId = str(i.assetId, 50);
    if (assetId && !/^[0-9a-f-]{36}$/i.test(assetId)) throw Error('Invalid uploaded image.');
    return {id: id(i.id), ...(assetId ? {assetId} : {}), pin: str(i.pin, 12), src, thumb: safeURL(i.thumb, {image: true}),
      href: safeURL(i.href), caption: str(i.caption, 1000), alt: str(i.alt, 500), aspect: num(i.aspect, 0.2, 5, 1),
      fit: i.fit === 'contain' ? 'contain' : 'cover', fx: num(i.fx, 0, 100, 50), fy: num(i.fy, 0, 100, 50)};
  };
  const labels = {};
  for (const k of LABEL_KEYS) labels[k] = str(input.labels?.[k], 120);
  return {
    version: VERSION, title: str(input.title, 160), kicker: str(input.kicker, 160), date: str(input.date, 80),
    headline: str(input.headline, 300), lede: str(input.lede, 1500), note: str(input.note, 1500), footer: str(input.footer, 1000), labels,
    territories: input.territories.map(t => {
      if (!plain(t) || !Array.isArray(t.ways) || t.ways.length > 8) throw Error('Invalid territory.');
      return {id: id(t.id), number: str(t.number, 12), name: str(t.name, 160), visual: str(t.visual, 160), quote: str(t.quote, 3000),
        thesis: str(t.thesis, 2000), names: str(t.names, 1000),
        ways: t.ways.map(w => {
          if (!plain(w) || !Array.isArray(w.images) || w.images.length > 40) throw Error('A way in can hold up to 40 images.');
          return {id: id(w.id), letter: str(w.letter, 6), title: str(w.title, 160), register: str(w.register, 160), how: str(w.how, 2000),
            why: str(w.why, 2000), brands: str(w.brands, 600), lead: w.lead !== false, images: w.images.map(image)};
        })};
    })
  };
}
export function assetIds(doc) {
  return [...new Set(doc.territories.flatMap(t => t.ways.flatMap(w => w.images.map(i => i.assetId).filter(Boolean))))];
}
