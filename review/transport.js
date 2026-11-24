(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NakedPakHostedTransport=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const CALLBACK='https://jalulia.github.io/nkdpk/review/';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 function validateConfig(config){
   let u;try{u=new URL(config.projectOrigin)}catch{throw Error('Private review is not configured.')}
   if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(u.origin)||u.href!==u.origin+'/'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)||
   config.bucket!=='nakedpak-review'||!/^catalog\/[a-zA-Z0-9_.-]+\.json(\.gz)?$/.test(config.catalogPath))throw Error('Private review is not configured.');
   return {...config,projectOrigin:u.origin};
 }
 function createTransport(input,request=fetch){
   const c=validateConfig(input);let session=null, refresh=null, generation=0;
   function saveSession(v){
     if(!v?.access_token||!v?.refresh_token)throw Error('The sign-in did not return a session.');
     session={access:v.access_token,refresh:v.refresh_token,expires:Date.now()+Math.max(0,Number(v.expires_in)||0)*1000};
   }
   async function api(path, {method='GET',body,auth=true,headers:extra={}}={}){
     const headers={apikey:c.publishableKey,...extra};
     if(body!==undefined)headers['content-type']='application/json';
     if(auth){if(!session)throw Error('Sign in to access the review.');headers.Authorization='Bearer '+session.access;}
     const r=await request(c.projectOrigin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
     if(!r.ok){const e=Error(r.status===429?'Too many requests. Wait a minute and try again.':'Could not open the private review.');e.status=r.status;throw e}
     return r;
   }
   async function assure(){
     if(!session)throw Error('Sign in to access the review.');
     if(Date.now()<=session.expires-45000) return;
     if(!refresh)refresh=(async()=>{
       const attempt=generation;
       const r=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh},auth:false});
       const value=await r.json();
       if(generation!==attempt)throw Error('This session closed. Sign in again.');
       saveSession(value);
     })().finally(()=>refresh=null);
     await refresh;
   }
   const secured=async(path,options)=>{await assure();return api(path,options)};
   async function exchange(code,verifier){
     if(typeof code!=='string'||!code||code.length>2048||!(/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)))throw Error('This sign-in link could not be matched. Request a new one.');
     session=null;const attempt=++generation;const r=await api('/auth/v1/token?grant_type=pkce',{method:'POST',auth:false,body:{auth_code:code,code_verifier:verifier}});
     const value=await r.json();
     if(generation!==attempt)throw Error('This session closed. Sign in again.');
     saveSession(value);
     try{
       const user=await (await secured('/auth/v1/user')).json();
       if(!UUID.test(user.id))throw Error('Invalid account.');
       const own='?select=user_id&user_id=eq.'+user.id+'&limit=1';
       const membership=await (await secured('/rest/v1/nakedpak_review_readers'+own)).json();
       if(membership.length!==1||membership[0].user_id!==user.id)throw Error('This account does not have access to the review.');
       return user.id;
     }catch(e){session=null;throw e}
   }
   async function pinCatalog(pin){
     if(!/^\d{4}$/.test(pin))throw Error('Enter a four-digit code.');
     const response=await request(c.projectOrigin+'/functions/v1/nakedpak-review-pin',{method:'POST',headers:{apikey:c.publishableKey,'content-type':'application/json'},body:JSON.stringify({pin}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
     if(response.status===401)throw Error('That code didn’t match.');
     if(response.status===429)throw Error('Too many attempts. Please wait '+Math.max(1,Math.min(1440,Math.ceil((Number(response.headers.get('Retry-After'))||60)/60)))+' minute(s) and try again.');
     if(!response.ok)throw Error('The review is temporarily unavailable.');
     const grant=await response.json(), url=new URL(grant.url);
     const token=url.searchParams.get('token');
     if(url.origin!==c.projectOrigin||url.username||url.password||url.hash||url.pathname!=='/storage/v1/object/sign/'+c.bucket+'/'+c.catalogPath||[...url.searchParams].length!==1||typeof token!=='string'||!/^[-.\w]{20,2048}$/.test(token))throw Error('Invalid download grant.');
     const resource=await request(url.href,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
     if(!resource.ok)throw Error('Could not load the review. Enter your code to retry.');
     return decodeCatalog(resource);
   }
   async function catalog(){
     const path='/storage/v1/object/authenticated/'+c.bucket+'/'+c.catalogPath;
     return decodeCatalog(await secured(path));
   }
   function decodeCatalog(r){
     if(c.catalogPath.endsWith('.gz')){
       if(typeof DecompressionStream==='undefined') throw Error('This browser cannot open the compressed gallery. Update your browser.');
       if((r.headers.get('content-encoding')||'').toLowerCase()!=='gzip'){
         r=new Response(r.body.pipeThrough(new DecompressionStream('gzip')));
       }
     }
     return r.json();
   }
   const path='/rest/v1/nakedpak_review_organization';
   function idFilter(user){if(!UUID.test(user))throw Error('Invalid account.');return 'user_id=eq.'+user;}
   async function getSettings(user){
     const res=await (await secured(path+'?select=revision,settings&'+idFilter(user)+'&limit=1')).json();
     if(!Array.isArray(res)||res.length>1)throw Error('Unexpected settings response.');
     return res[0]||null;
   }
   function conflict(){const e=Error('Settings changed in another session. Export these changes before reopening the review.');e.conflict=true;return e;}
   async function putSettings(user,revision,settings){
     const u=idFilter(user), body={revision:revision===null?1:revision+1,settings};
     try{
      const r=revision===null
       ? await secured(path,{method:'POST',body:{...body,user_id:user},headers:{Prefer:'return=representation'}})
       : await secured(path+'?'+u+'&revision=eq.'+revision,{method:'PATCH',body,headers:{Prefer:'return=representation'}});
      const rows=await r.json();
      if(rows.length!==1||rows[0].revision!==body.revision)throw conflict();
      return body.revision;
     }catch(e){if(e.status===409)throw conflict();throw e;}
   }
   return {
     sendLink(email,challenge){
       if(!/^[A-Za-z0-9_-]{43}$/.test(challenge))throw Error('Could not start secure sign-in.');
       return api('/auth/v1/otp?redirect_to='+encodeURIComponent(CALLBACK),{method:'POST',auth:false,body:{email,create_user:false,code_challenge:challenge,code_challenge_method:'s256'}})
     },
     exchange,catalog,pinCatalog,getSettings,putSettings,
     async exit(){if(!session)return;try{await secured('/auth/v1/logout?scope=local',{method:'POST'})}finally{++generation;session=null}},
     clear(){++generation;session=null},
     active:()=>!!session
   }
 }
 return {CALLBACK,validateConfig,createTransport};
});
