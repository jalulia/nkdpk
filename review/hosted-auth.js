(()=>{
'use strict';
const $=id=>document.getElementById(id), gate=$('auth-gate'), pane=$('private-pane'), hint=$('auth-status'), syncHint=$('sync-status');
const errorText=e=>e?.status===429?'Too many requests. Wait a minute and try again.':e?.message||'Could not open the private review.';
const send=$('auth-send');
let transport, uid='', waiting=0, pending=null, failed=false, dirty=false, busy=false, loaded=false, closing=false;
const VERIFIER_KEY='nakedpak.review.pkce.v1', VERIFIER_TTL=10*60*1000;
const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const uuidishCode=code=>typeof code==='string'&&/^[A-Za-z0-9._~-]{1,2048}$/.test(code);
function forgetVerifier(){try{localStorage.removeItem(VERIFIER_KEY)}catch{}}
function popVerifier(){
 let raw;try{raw=localStorage.getItem(VERIFIER_KEY)}catch{}
 forgetVerifier();if(!raw)return null;
 try{const v=JSON.parse(raw); return Date.now()<=v.expires&&/^[A-Za-z0-9_-]{43}$/.test(v.verifier)?v.verifier:null;}catch{return null}
}
const incoming=new URL(location.href), authKeys=['code','error','error_description','error_code','access_token','refresh_token','sb_flow_id'];
const callback=incoming.searchParams.get('code');
const badCallback=incoming.searchParams.has('error')||/access_token=|refresh_token=|error=|error_code=/.test(incoming.hash);
if(authKeys.some(k=>incoming.searchParams.has(k))||badCallback){
 try{history.replaceState(null,'',incoming.pathname)}catch{location.replace(incoming.pathname);return}
}

function say(message){hint.textContent=message}
function state(message){syncHint.textContent=message}
function failClosed(message){pane.hidden=true;gate.hidden=false;say(message)}
function unavailable(message){failClosed(message);send.querySelector('button').disabled=true;$('pin-form').querySelector('button').disabled=true}
// Remove an abandoned verifier on next review visit; no other review state uses localStorage.
try{const raw=localStorage.getItem(VERIFIER_KEY);if(raw){const v=JSON.parse(raw);if(!v.expires||Date.now()>v.expires)forgetVerifier()}}catch{forgetVerifier()}
if(window.top!==window.self){unavailable('Open the review directly in a browser tab.');return;}
if(navigator.serviceWorker?.controller){unavailable('Open the review in a browser profile without a site service worker.');return;}
try{window.opener=null}catch{}
try{transport=NakedPakHostedTransport.createTransport(globalThis.NakedPakConfig)}catch(e){unavailable(e.message);return}
function scrub(){
 closing=true;pane.hidden=true;gate.hidden=false;send.reset();$('pin-form').reset();$('pin-status').textContent='';uid='';pending=null;transport.clear();
 for(const dialog of pane.querySelectorAll('dialog[open]'))dialog.close();
 $('data').textContent='{}';
 for(const image of pane.querySelectorAll('img'))image.removeAttribute('src');
 // A same-origin scope can retain old script closures in bfcache; force a fresh document on restore.
}
window.addEventListener('pagehide',scrub);
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
navigator.serviceWorker?.addEventListener('controllerchange',()=>{
 if(navigator.serviceWorker.controller){scrub();unavailable('The review closed because a site service worker took control. Open it on an isolated origin.');}
});
send.addEventListener('submit',async ev=>{
 ev.preventDefault();
 if(busy||closing||loaded||Date.now()<waiting)return;
 const email=$('auth-email').value.trim();if(!email||email.length>254)return;
 if(location.origin+location.pathname!==NakedPakHostedTransport.CALLBACK){say('Open the exact hosted review URL to sign in.');return;}
 busy=true;waiting=Date.now()+60000;send.querySelector('button').disabled=true;
 try{
   const verifier=b64url(crypto.getRandomValues(new Uint8Array(32)));
   const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
   const challenge=b64url(hash);
   try{
     const record=JSON.stringify({verifier,expires:Date.now()+VERIFIER_TTL});
     localStorage.setItem(VERIFIER_KEY,record);
     setTimeout(()=>{try{if(localStorage.getItem(VERIFIER_KEY)===record)forgetVerifier()}catch{}},VERIFIER_TTL);
   }catch{throw Error('Allow temporary browser storage before signing in.');}
   await transport.sendLink(email,challenge);
   send.reset();
   say('If this address is authorized, a sign-in link is on the way. Open the link in this same browser and profile within 10 minutes.');
 }catch(e){
   forgetVerifier();
   if([400,401,403,422].includes(e.status))say('If this address is authorized, a sign-in link is on the way. Keep this tab open.');
   else say(errorText(e));
 }finally{busy=false;setTimeout(()=>{if(!closing)send.querySelector('button').disabled=false},Math.max(0,waiting-Date.now()))}
});
function mountGallery(catalog,role){
    if(typeof catalog!=='object'||!Array.isArray(catalog.decks)||!catalog.decks.length||catalog.decks.length>250||
     !catalog.pictures||!catalog.thumbnails||!Array.isArray(catalog.hero))throw Error('The protected catalog is incomplete.');
   // Only the protected catalog provides art. Hosted display has no links into private file stores.
   delete catalog.publicationToken;catalog.bundle=false;catalog.sources=[];
   for(const deck of catalog.decks)deck.links=[];
   if([...Object.values(catalog.pictures),...Object.values(catalog.thumbnails)].some(u=>typeof u!=='string'||!/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(u)))throw Error('Unexpected image source in the catalog.');

 globalThis.NakedPakReadOnly=role==='viewer';
 $('cms').hidden=role==='viewer';
 $('data').textContent=JSON.stringify(catalog);
 send.reset();$('pin-form').reset();
 if(loaded)throw Error('Reopen the review to sign in again.');
 loaded=true;
 const script=document.createElement('script');script.src='./gallery.cms.js';
 script.onload=()=>{if(closing)return;pane.hidden=false;gate.hidden=true;state(role==='viewer'?'Review · viewing only':'Private review · settings sync to your account');$('auth-logout').textContent=role==='viewer'?'Lock review':'Sign out';$('auth-logout').focus();};
 script.onerror=()=>{scrub();unavailable('Gallery interface could not load. Reopen this page.');};
 document.head.append(script);
}
$('pin-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||closing||loaded)return;
 const form=e.currentTarget,button=form.querySelector('button'),status=$('pin-status'),pin=$('review-pin').value;
 if(!/^\d{4}$/.test(pin))return;
 form.reset();busy=true;button.disabled=true;status.textContent='Opening review…';
 try{
   const catalog=await transport.pinCatalog(pin);
   if(closing)return;
   globalThis.NakedPakCMSStorage=Object.freeze({getItem(){return null},setItem(){}});
   $('auth-logout').addEventListener('click',()=>{scrub();location.reload()},{once:true});
   mountGallery(catalog,'viewer');
 }catch(err){if(!closing){status.textContent=err.message;$('review-pin').focus();}}
 finally{busy=false;if(!closing)button.disabled=false;}
});
async function enter(code,verifier){
 busy=true;send.querySelector('button').disabled=true;say('Opening private review…');
 try{
   uid=await transport.exchange(code,verifier);
   const [catalog,row]=await Promise.all([transport.catalog(),transport.getSettings(uid)]);
   if(closing)return;
   let revision=row?.revision??null,saved=row?.settings?JSON.stringify(NakedPakCMS.validate(row.settings)):'';
   let conflict=false, inflight=null;
   async function flush(){
     if(inflight||conflict||!pending||!transport.active()) return;
     inflight=(async()=>{
      while(pending&&transport.active()&&!conflict){
       const next=pending;
       try{
        revision=await transport.putSettings(uid,revision,JSON.parse(next));
        failed=false;
        if(pending===next){pending=null;dirty=false;state('Review settings synced.');}
       }catch(e){
        failed=true;conflict=!!e.conflict;state(conflict?e.message:'Could not sync. Keep this tab open or export a backup.');return;
       }
      }
     })().finally(()=>{inflight=null;if(pending&&!failed&&!conflict)void flush()});
     return inflight;
   }
   globalThis.NakedPakCMSStorage={
    getItem(){return saved||null;},
    setItem(_key,value){saved=value;pending=value;dirty=true;state(conflict?'Settings changed in another session. Export before reopening.':'Syncing review settings…');failed=false;void flush();}
   };
   window.addEventListener('online',()=>{failed=false;void flush()});
   window.addEventListener('beforeunload',e=>{if(!dirty)return;e.preventDefault();e.returnValue=true});
   $('auth-logout').addEventListener('click',async()=>{if(dirty){state('Wait for the current save or export and close the tab.');return;}try{await transport.exit();}finally{location.reload();}});
   mountGallery(catalog,'owner');
 }catch(e){try{await transport.exit()}catch{}failClosed(e.status===403?'This account does not have access to the review.':errorText(e));}
 finally{busy=false;if(!closing)send.querySelector('button').disabled=false;}
}
if(badCallback||callback!==null)$('owner-sign-in').open=true;
if(badCallback){forgetVerifier();say('This sign-in link did not complete. Request a fresh link and use the same browser and profile.');}
else if(callback!==null){
 const verifier=popVerifier();
 if(!uuidishCode(callback)||!verifier||location.origin+location.pathname!==NakedPakHostedTransport.CALLBACK)
   say('This link could not be matched. Request a fresh link and use the same browser and profile.');
 else void enter(callback,verifier);
}
})();
