import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../boards/app.mjs',import.meta.url),'utf8').replace(/^import .*\n/,'').replace('void init();','');
function browser(request,remembered=''){
 const local=new Map(remembered?[['nkdpk.browser.editor.v1',remembered]]:[]),session=new Map(),nodes=new Map();
 const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
 const context=vm.createContext({fetch:request,AbortSignal,structuredClone,URL,localStorage:storage(local),sessionStorage:storage(session),document:{body:{classList:{toggle(){}}},getElementById:id=>{if(!nodes.has(id))nodes.set(id,{classList:{toggle(){}}});return nodes.get(id);},querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},history:{replaceState(){}},location:{hash:'',pathname:'/nkdpk/boards/'},setTimeout,clearTimeout});
 vm.runInContext(source+'\nglobalThis.check={api,syncControls};',context);
 return {api:context.check.api,nodes,session,controls:context.check.syncControls};
}
const response=(status,body)=>({status,ok:status<400,json:async()=>body});
test('public viewing never asks for credentials or acquires write access',async()=>{
 const calls=[];const b=browser(async(url,init)=>{calls.push({url,init});return response(200,{document:{}});});
 await b.api();b.controls();assert.equal(calls.length,1);assert.equal(calls[0].init.headers['x-editor-session'],undefined);assert.equal(b.nodes.get('edit-toggle').hidden,true);assert.equal(b.session.size,0);
});
test('a remembered browser renews an expired session and retries its draft once',async()=>{
 const calls=[];let drafts=0;
 const b=browser(async(url,init)=>{calls.push({url,init});if(url.endsWith('/unlock'))return response(200,{token:'fresh-session',expiresAt:Date.now()+10000});return ++drafts===1?response(401,{error:'expired'}):response(200,{revision:12});},'browser-credential');
 assert.equal((await b.api('/draft')).revision,12);assert.equal(calls.length,3);assert.deepEqual(JSON.parse(calls[1].init.body),{key:'browser-credential'});assert.equal(calls[2].init.headers['x-editor-session'],'fresh-session');b.controls();assert.equal(b.nodes.get('edit-toggle').hidden,false);
});
test('an invalid browser credential stops without an authentication loop',async()=>{
 let calls=0;const b=browser(async()=>{calls++;return response(401,{error:'expired'});},'invalid-credential');
 await assert.rejects(b.api('/draft'),/expired/);assert.equal(calls,2);
});
test('viewing pages contain no password form, secret-link prompt or retired gallery loader',()=>{
 for(const file of ['boards/index.html','review/index.html','review/legacy.html']){
  const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.doesNotMatch(html,/type="password"|private editor link|review code|hosted-auth\.js/);
 }
});
