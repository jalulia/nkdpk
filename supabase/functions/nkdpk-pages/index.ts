// Editable NakedPak pages (first one: r1-moodboards). Shares the visual boards' editor
// sessions, uploads and image assets; stores each page in its own nkdpk_pages_* row.
import { validatePage, assetIds } from "./page-model.mjs";
const BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "nkdpk-boards";
const ASSET_API = BASE + "/functions/v1/nkdpk-boards/asset/";
const allowedOrigin = (o: string) => o === "https://jalulia.github.io" || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o);
const hash = async (v: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))].map(x => x.toString(16).padStart(2, "0")).join("");
async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE, ...init.headers } });
  if (!r.ok) throw Error("Storage or database request failed (" + r.status + ").");
  return r;
}
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
async function session(req: Request) {
  const token = req.headers.get("x-editor-session") || "";
  if (!/^[\w-]{43}$/.test(token)) return "";
  const h = await hash(token);
  const list = await (await sb("/rest/v1/nkdpk_boards_sessions?select=token_hash&token_hash=eq." + h + "&expires_at=gt." + encodeURIComponent(new Date().toISOString()))).json();
  return list.length === 1 ? h : "";
}
async function readBody(req: Request, max = 1048576) {
  if (Number(req.headers.get("content-length")) > max) throw Error("The request is too large.");
  const text = await req.text(); if (text.length > max) throw Error("The request is too large.");
  return JSON.parse(text);
}
async function signed(path: string) {
  const r = await (await sb("/storage/v1/object/sign/" + BUCKET + "/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 43200 }) })).json();
  return BASE + "/storage/v1" + r.signedURL;
}
async function hydrate(document: any, revision: number, publishedRevision: number) {
  const ids = assetIds(document), previews: Record<string, string> = {};
  if (ids.length) {
    const assets = await (await sb("/rest/v1/nkdpk_boards_assets?select=id,path&id=in.(" + ids.join(",") + ")&published=eq.false")).json();
    await Promise.all(assets.map(async (a: any) => previews[a.id] = await signed(a.path)));
  }
  return { document, revision, publishedRevision, previews };
}
const row = async (slug: string, cols: string) => (await (await sb("/rest/v1/nkdpk_pages_state?select=" + cols + "&slug=eq." + slug)).json())[0];
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const cors = origin && allowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {};
  const headers = { ...cors, "Access-Control-Allow-Headers": "content-type,x-editor-session,apikey", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
  if (origin && !allowedOrigin(origin)) return json({ error: "Origin not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    const parts = (new URL(req.url).pathname.split("/nkdpk-pages")[1] || "/").split("/").filter(Boolean);
    const slug = parts[0] || "";
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) return json({ error: "Not found." }, 404, headers);
    const action = parts.slice(1).join("/");
    if (req.method === "GET" && action === "") {
      const r = await row(slug, "published,published_revision");
      if (!r) return json({ error: "Not found." }, 404, headers);
      return json({ document: r.published, revision: r.published_revision }, 200, headers);
    }
    if (!(await session(req))) return json({ error: "Open the page in your editing browser to make changes." }, 401, headers);
    if (req.method === "GET" && action === "draft") {
      const r = await row(slug, "draft,revision,published_revision");
      if (!r) return json({ error: "Not found." }, 404, headers);
      return json(await hydrate(r.draft, r.revision, r.published_revision), 200, headers);
    }
    if (req.method === "POST" && (action === "draft" || action === "publish")) {
      const body = await readBody(req);
      if (!Number.isInteger(body.revision) || body.revision < 0) return json({ error: "Missing saved revision." }, 400, headers);
      const document = validatePage(body.document);
      for (const t of document.territories) for (const w of t.ways) for (const i of w.images)
        if (i.assetId && i.src !== ASSET_API + i.assetId) return json({ error: "Invalid uploaded image reference." }, 400, headers);
      const ids = assetIds(document);
      if (ids.length) {
        const found = await (await sb("/rest/v1/nkdpk_boards_assets?select=id&id=in.(" + ids.join(",") + ")")).json();
        if (found.length !== ids.length) return json({ error: "An uploaded image is missing." }, 400, headers);
      }
      const result = await (await sb("/rest/v1/rpc/nkdpk_pages_save", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_slug: slug, p_revision: body.revision, p_document: document, p_publish: action === "publish" }) })).json();
      return json(result, result.conflict ? 409 : 200, headers);
    }
    if (req.method === "GET" && action === "history") {
      return json(await (await sb("/rest/v1/nkdpk_pages_history?select=revision,published,created_at&slug=eq." + slug + "&order=revision.desc&limit=40")).json(), 200, headers);
    }
    if (req.method === "GET" && /^history\/\d+$/.test(action)) {
      const item = (await (await sb("/rest/v1/nkdpk_pages_history?select=document,revision&slug=eq." + slug + "&revision=eq." + parts[2])).json())[0];
      if (!item) return json({ error: "Version not found." }, 404, headers);
      return json(await hydrate(item.document, item.revision, 0), 200, headers);
    }
    return json({ error: "Not found." }, 404, headers);
  } catch (e) { return json({ error: e instanceof Error ? e.message : "The request could not be completed." }, 400, headers); }
});
