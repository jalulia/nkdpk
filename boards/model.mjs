export const VERSION = 1;
export const uid = () => crypto.randomUUID();
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, n = 4000) => typeof v === 'string' ? v.slice(0, n) : '';
const number = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
export function safeURL(value, {image = false} = {}) {
  if (!value) return '';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    if (image && /[<>]/.test(value)) return '';
    return u.href;
  } catch { return ''; }
}
export function move(items, from, to) {
  const out = [...items];
  const index = typeof from === 'number' ? from : out.findIndex(x => x.id === from);
  if (index < 0 || index >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, Number(to)));
  if (!Number.isInteger(target)) return out;
  const [item] = out.splice(index, 1); out.splice(target, 0, item);
  return out;
}
export function validateDocument(input) {
  if (!plain(input) || input.version !== VERSION || !Array.isArray(input.territories) || input.territories.length > 12) throw Error('This is not a valid board collection.');
  const ids = new Set();
  const id = value => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value) || ids.has(value)) throw Error('Every item needs a unique ID.');
    ids.add(value); return value;
  };
  let imageCount = 0;
  const images = list => {
    if (!Array.isArray(list) || list.length > 60) throw Error('A board can contain up to 60 images.');
    return list.map(i => {
      if (!plain(i) || ++imageCount > 700) throw Error('This collection has too many images.');
      const src = safeURL(i.src, {image:true});
      if (!src) throw Error('Images need a valid HTTPS source.');
      const assetId = str(i.assetId, 50);
      if (assetId && !/^[0-9a-f-]{36}$/i.test(assetId)) throw Error('Invalid uploaded image.');
      return {id:id(i.id), src, ...(assetId ? {assetId} : {}), label:str(i.label, 150), caption:str(i.caption, 1000), alt:str(i.alt, 500), source:safeURL(i.source), fallbackSrc:safeURL(i.fallbackSrc,{image:true}), fit:i.fit === 'contain' ? 'contain' : 'cover', focalX:number(i.focalX,0,100,50), focalY:number(i.focalY,0,100,50), size:['wide','tall'].includes(i.size)?i.size:'standard'};
    });
  };
  return {version:1, title:str(input.title,100)||'NakedPak', date:str(input.date,80), category:str(input.category,100)||'Brand design',
    territories:input.territories.map(t=>{
      if (!plain(t) || !Array.isArray(t.boards) || !Array.isArray(t.studies) || t.boards.length>30 || t.studies.length>30) throw Error('Invalid territory.');
      return {id:id(t.id),name:str(t.name,160),description:str(t.description,1500),
        boards:t.boards.map(b=>({id:id(b.id),title:str(b.title,160),description:str(b.description,2000),layout:['balanced','wall'].includes(b.layout)?b.layout:'editorial',images:images(b.images)})),
        studies:t.studies.map(b=>({id:id(b.id),name:str(b.name,160),category:str(b.category,160),description:str(b.description,3000),website:safeURL(b.website),instagram:safeURL(b.instagram),images:images(b.images)}))};
    })};
}
export function assetIds(doc) {
  return [...new Set(doc.territories.flatMap(t=>[...t.boards,...t.studies].flatMap(b=>b.images.map(i=>i.assetId).filter(Boolean))))];
}

