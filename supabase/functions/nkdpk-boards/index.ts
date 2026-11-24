import { validateDocument, assetIds } from "./model.mjs";
const BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "nkdpk-boards";
const API = BASE + "/functions/v1/nkdpk-boards";
const allowedOrigin = (origin:string) => origin==="https://jalulia.github.io" || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
const hash = async (v:string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,"0")).join("");
const random = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function sb(path:string, init:RequestInit={}) {
  const r=await fetch(BASE+path,{...init,headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,...init.headers}});
  if(!r.ok)throw Error("Storage or database request failed ("+r.status+").");
  return r;
}
const json=(body:unknown,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});
const rpc=async(name:string,body:unknown)=>(await sb("/rest/v1/rpc/"+name,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).json();
async function session(req:Request) {
  const token=req.headers.get("x-editor-session")||"";
  if(!/^[\w-]{43}$/.test(token))return "";
  const tokenHash=await hash(token);
  const list=await (await sb("/rest/v1/nkdpk_boards_sessions?select=token_hash&token_hash=eq."+tokenHash+"&expires_at=gt."+encodeURIComponent(new Date().toISOString()))).json();
  return list.length===1?tokenHash:"";
}
async function readBody(req:Request,max=1048576){
  if(Number(req.headers.get("content-length"))>max)throw Error("The request is too large.");
  const text=await req.text();if(text.length>max)throw Error("The request is too large.");
  return JSON.parse(text);
}
async function signed(path:string) {
 const r=await (await sb("/storage/v1/object/sign/"+BUCKET+"/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expiresIn:43200})})).json();
 return BASE+"/storage/v1"+r.signedURL;
}
async function draftResponse(row:any) {
 const ids=assetIds(row.draft), previews:Record<string,string>={};
 if(ids.length){
  const assets=await (await sb("/rest/v1/nkdpk_boards_assets?select=id,path&id=in.("+ids.join(",")+")&published=eq.false")).json();
  await Promise.all(assets.map(async(a:any)=>previews[a.id]=await signed(a.path)));
 }
 return {document:row.draft,revision:row.revision,publishedRevision:row.published_revision,previews};
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 const cors=origin&&allowedOrigin(origin)?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{};
 const headers={...cors,"Access-Control-Allow-Headers":"content-type,x-editor-session,apikey","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
 if(origin&&!allowedOrigin(origin))return json({error:"Origin not allowed."},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 try{
  const path=new URL(req.url).pathname.split("/nkdpk-boards")[1]||"/";
  if(req.method==="GET"&&path==="/"){
   const row=(await (await sb("/rest/v1/nkdpk_boards_state?select=published,published_revision&id=eq.true")).json())[0];
   return json({document:row.published,revision:row.published_revision},200,headers);
  }
  if(req.method==="GET"&&/^\/asset\/[0-9a-f-]{36}$/.test(path)){
   const id=path.split("/")[2];
   const a=(await (await sb("/rest/v1/nkdpk_boards_assets?select=path,mime,published&id=eq."+id)).json())[0];
   if(!a?.published)return json({error:"Image not found."},404,headers);
   const response=await sb("/storage/v1/object/authenticated/"+BUCKET+"/"+a.path);
   return new Response(response.body,{headers:{...headers,"Content-Type":a.mime,"Cache-Control":"public,max-age=3600","X-Content-Type-Options":"nosniff"}});
  }
  if(req.method==="POST"&&path==="/unlock"){
   const body=await readBody(req,1024);
   if(typeof body.key!=="string"||!/^[-_A-Za-z0-9]{43}$/.test(body.key))return json({error:"Use your private editing link or key."},401,headers);
   const token=random();
   const status=await rpc("nkdpk_boards_unlock",{p_key_hash:await hash(body.key),p_fingerprint:await hash((req.headers.get("x-forwarded-for")||req.headers.get("cf-connecting-ip")||"unknown").split(",")[0].trim()),p_token_hash:await hash(token)});
   if(status!=="ok")return json({error:status==="rate_limited"?"Too many attempts. Try again in five minutes.":"That editing key did not match."},status==="rate_limited"?429:401,headers);
   return json({token,expiresAt:Date.now()+43200000},200,headers);
  }
  const tokenHash=await session(req);
  if(!tokenHash)return json({error:"Open your private editor link to make changes."},401,headers);
  if(req.method==="POST"&&path==="/logout"){
   await sb("/rest/v1/nkdpk_boards_sessions?token_hash=eq."+tokenHash,{method:"DELETE"});
   return json({ok:true},200,headers);
  }
  if(req.method==="GET"&&path==="/draft"){
   const row=(await (await sb("/rest/v1/nkdpk_boards_state?select=draft,revision,published_revision&id=eq.true")).json())[0];
   return json(await draftResponse(row),200,headers);
  }
  if(req.method==="POST"&&(path==="/draft"||path==="/publish")){
   const body=await readBody(req);
   if(!Number.isInteger(body.revision)||body.revision<0)return json({error:"Missing saved revision."},400,headers);
   const document=validateDocument(body.document);
   for(const t of document.territories)for(const b of [...t.boards,...t.studies])for(const i of b.images){
    if(i.assetId&&i.src!==API+"/asset/"+i.assetId)return json({error:"Invalid uploaded image reference."},400,headers);
   }
   const ids=assetIds(document);
   if(ids.length){const found=await (await sb("/rest/v1/nkdpk_boards_assets?select=id&id=in.("+ids.join(",")+")")).json();if(found.length!==ids.length)return json({error:"An uploaded image is missing."},400,headers);}
   const result=await rpc("nkdpk_boards_save",{p_revision:body.revision,p_document:document,p_publish:path==="/publish"});
   return json(result,result.conflict?409:200,headers);
  }
  if(req.method==="GET"&&path==="/history"){
   return json(await (await sb("/rest/v1/nkdpk_boards_history?select=revision,published,created_at&order=revision.desc&limit=30")).json(),200,headers);
  }
  if(req.method==="GET"&&/^\/history\/\d+$/.test(path)){
   const item=(await (await sb("/rest/v1/nkdpk_boards_history?select=document,revision&revision=eq."+path.split("/")[2])).json())[0];
   if(!item)return json({error:"Version not found."},404,headers);
   const hydrated=await draftResponse({draft:item.document,revision:item.revision,published_revision:0});
   return json(hydrated,200,headers);
  }
  if(req.method==="POST"&&path==="/upload"){
   if(Number(req.headers.get("content-length"))>10485760)return json({error:"Use an image smaller than 10 MB."},413,headers);
   const bytes=new Uint8Array(await req.arrayBuffer());
   if(bytes.length>10485760||bytes.length<12)return json({error:"Use an image smaller than 10 MB."},413,headers);
   const head=new TextDecoder().decode(bytes.slice(0,12));
   let mime="",ext="";
   if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){mime="image/jpeg";ext="jpg";}
   else if(bytes[0]===137&&head.slice(1,4)==="PNG"){mime="image/png";ext="png";}
   else if(head.startsWith("RIFF")&&head.slice(8,12)==="WEBP"){mime="image/webp";ext="webp";}
   else if(head.startsWith("GIF87a")||head.startsWith("GIF89a")){mime="image/gif";ext="gif";}
   else return json({error:"Choose a JPG, PNG, WebP or GIF image."},400,headers);
   const id=crypto.randomUUID(),file=id+"."+ext;
   await sb("/storage/v1/object/"+BUCKET+"/"+file,{method:"POST",headers:{"Content-Type":mime,"x-upsert":"false","Cache-Control":"3600"},body:bytes});
   await sb("/rest/v1/nkdpk_boards_assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,path:file,mime,bytes:bytes.length})});
   return json({assetId:id,src:API+"/asset/"+id,preview:await signed(file)},201,headers);
  }
  return json({error:"Not found."},404,headers);
 }catch(e){return json({error:e instanceof Error?e.message:"The request could not be completed."},400,headers);}
});
