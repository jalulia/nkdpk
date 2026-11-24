import {validateDocument, safeURL, move, uid} from './model.mjs';
const API='https://ycolvxmvcmxfnuicgfay.supabase.co/functions/v1/nkdpk-boards';
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn,cls='')=>{const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;};
const clone=x=>structuredClone(x);
const SESSION='nkdpk.boards.editor.v1',RECOVERY='nkdpk.boards.recovery.v1';
let doc,revision=0,publishedRevision=0,token='',editing=false,previewing=false,tid='',bid='',studyMode=false,selection=null;
let dirty=false,saving=false,conflict=false,saveError='',changeSeq=0,timer=null,retryTimer=null;
let undoStack=[],redoStack=[],previews={},uploadTarget=null,lightImages=[],lightIndex=0,toastTimer,loading=false;
const activeTerritory=()=>doc?.territories.find(t=>t.id===tid)||doc?.territories[0];
const activeBoard=()=>activeTerritory()?.boards.find(b=>b.id===bid)||activeTerritory()?.boards[0];
const canEdit=()=>editing&&!previewing;
const findParent=id=>{for(const t of doc.territories)for(const b of [...t.boards,...t.studies])if(b.id===id)return {territory:t,item:b,kind:t.boards.includes(b)?'board':'study'};return null;};
const findImage=id=>{for(const t of doc.territories)for(const b of [...t.boards,...t.studies]){const image=b.images.find(i=>i.id===id);if(image)return {territory:t,parent:b,image,kind:t.boards.includes(b)?'board':'study'};}return null;};
function toast(message,delay=4200){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);if(delay)toastTimer=setTimeout(()=>$('toast').hidden=true,delay);}
async function api(path='',{method='GET',body,raw=false}={}){
 const headers={};if(token)headers['x-editor-session']=token;if(body!==undefined)headers['Content-Type']=raw?(body.type||'application/octet-stream'):'application/json';
 const response=await fetch(API+path,{method,headers,body:body===undefined?undefined:raw?body:JSON.stringify(body),credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(raw?90000:25000)});
 const result=await response.json().catch(()=>({error:'The server returned an unreadable response.'}));
 if(!response.ok){const e=Error(result.error||(response.status===409?'A newer draft was saved in another tab.':'Could not save. Please try again.'));e.status=response.status;e.conflict=response.status===409;throw e;}
 return result;
}
function saveSession(result){token=result.token;sessionStorage.setItem(SESSION,JSON.stringify(result));}
function remember(){try{localStorage.setItem(RECOVERY,JSON.stringify({document:doc,revision,at:Date.now()}));}catch{}}
function rememberUndo(){undoStack.push(JSON.stringify(doc));if(undoStack.length>50)undoStack.shift();redoStack=[];syncControls();}
function markChanged(){dirty=true;changeSeq++;saveError='';remember();syncControls();clearTimeout(timer);timer=setTimeout(()=>void flush(),650);}
function change(fn,{snapshot=true,inspector=true}={}){if(!editing)return;if(snapshot)rememberUndo();fn();markChanged();render();if(inspector)renderInspector();}
function syncControls(){
 $('publish').hidden=!editing;$('editbar').hidden=!editing;$('edit-toggle').textContent=editing?'Edit selection':'Edit boards';
 $('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;
 $('publish').disabled=saving||conflict||loading||(!dirty&&revision===publishedRevision);
 $('preview-mode').textContent=previewing?'Return to editor':'Preview';
 const status=conflict?'Newer draft exists':saveError||saving?'':dirty?'Unsaved changes':editing?(revision===publishedRevision?'Published':'Draft saved'):'';
 $('sync-status').textContent=conflict?'Newer draft exists':saveError?saveError:saving?'Saving draft…':status;
 $('sync-status').classList.toggle('error',!!saveError||conflict);
 document.body.classList.toggle('editing',editing);document.body.classList.toggle('previewing',previewing);
 $('inspector').hidden=!canEdit();
}
async function flush(){
 clearTimeout(timer);if(saving){while(saving)await new Promise(r=>setTimeout(r,60));return !dirty&&!conflict;}
 if(!dirty)return true;if(conflict||!token)return false;
 saving=true;syncControls();
 try{
  while(dirty&&!conflict){
   const seq=changeSeq,candidate=validateDocument(doc);
   const result=await api('/draft',{method:'POST',body:{revision,document:candidate}});
   revision=result.revision;publishedRevision=result.publishedRevision;
   if(seq===changeSeq){dirty=false;try{localStorage.removeItem(RECOVERY)}catch{}}
  }
  saveError='';return true;
 }catch(e){
  conflict=!!e.conflict;
  saveError=e.status===401?'Session ended. Open your editor link.':e.message;
  if(conflict){renderInspector();toast('A newer draft exists. Your changes are kept here. Export them or load the latest version.',0);}
  else if(e.status!==400&&e.status!==401){clearTimeout(retryTimer);retryTimer=setTimeout(()=>void flush(),15000);}
  return false;
 }finally{saving=false;syncControls();}
}
async function publish(){
 if(!await flush())return;
 loading=true;syncControls();const seq=changeSeq;
 try{
  const result=await api('/publish',{method:'POST',body:{revision,document:validateDocument(doc)}});
  revision=result.revision;publishedRevision=result.publishedRevision;
  toast('Published. The shared boards now show this version.');
  if(seq!==changeSeq){dirty=true;void flush();}
 }catch(e){conflict=!!e.conflict;saveError=e.message;toast(e.message);renderInspector();}
 finally{loading=false;syncControls();}
}
async function ask(title,copy){
 $('confirm-title').textContent=title;$('confirm-copy').textContent=copy;
 const dialog=$('confirm-dialog');dialog.returnValue='';dialog.showModal();
 return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
}
function ensureRoute(){
 const t=activeTerritory();if(!t){tid='';bid='';return;}
 tid=t.id;const b=activeBoard();bid=b?.id||'';
}
function route(t,b,studies=false){tid=t;bid=b||'';studyMode=studies;selection=null;ensureRoute();history.replaceState(null,'','#'+tid+'/'+(studyMode?'studies':bid));render();renderInspector();}
function parseRoute(){
 const parts=location.hash.slice(1).split('/');
 if(doc.territories.some(t=>t.id===parts[0]))tid=parts[0];
 studyMode=parts[1]==='studies';if(!studyMode)bid=parts[1]||'';
 ensureRoute();
}
const sourceURL=i=>i.assetId&&previews[i.assetId]||i.src;
function dragData(e,value){e.dataTransfer.setData('application/x-nakedpak',JSON.stringify(value));e.dataTransfer.effectAllowed='move';}
function readDrag(e){try{return JSON.parse(e.dataTransfer.getData('application/x-nakedpak'))}catch{return null}}
function reorderTerritory(target,e){
 e.preventDefault();const d=readDrag(e);if(d?.kind!=='territory')return;
 change(()=>doc.territories=move(doc.territories,d.id,doc.territories.findIndex(t=>t.id===target)));toast('Territory order updated.');
}
function imageNode(image,parent,kind){
 const figure=el('figure','image-frame size-'+image.size+(image.fit==='contain'?' contain':''));
 figure.dataset.imageId=image.id;figure.dataset.parentId=parent.id;
 figure.style.setProperty('--fit',image.fit);figure.style.setProperty('--fx',image.focalX+'%');figure.style.setProperty('--fy',image.focalY+'%');
 const img=el('img');img.src=sourceURL(image);img.alt=image.alt||image.label||'Visual reference';img.decoding='async';img.loading='lazy';
 img.addEventListener('error',()=>{if(image.fallbackSrc&&!img.dataset.fallback){img.dataset.fallback='true';img.src=image.fallbackSrc;}else figure.classList.add('image-error');});
 figure.append(img);if(image.label)figure.append(el('figcaption','',image.label));
 figure.tabIndex=0;figure.setAttribute('role','button');figure.setAttribute('aria-label',(canEdit()?'Edit image: ':'Enlarge image: ')+(image.label||image.alt||'Visual reference'));
 const choose=()=>{if(canEdit()){selection={kind:'image',id:image.id,parentId:parent.id};highlightSelection();renderInspector();}else openLightbox(parent.images,parent.images.findIndex(i=>i.id===image.id));};
 figure.onclick=choose;figure.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};
 if(canEdit()){
  figure.draggable=true;figure.append(button('Drag / edit',e=>{e.stopPropagation();choose();},'image-edit'));
  figure.ondragstart=e=>{dragData(e,{kind:'image',id:image.id,parentId:parent.id});figure.classList.add('dragging');};
  figure.ondragend=()=>document.querySelectorAll('.dragging,.drag-over').forEach(n=>n.classList.remove('dragging','drag-over'));
  figure.ondragover=e=>{e.preventDefault();figure.classList.add('drag-over');};
  figure.ondragleave=()=>figure.classList.remove('drag-over');
  figure.ondrop=e=>{
   if(e.dataTransfer.files.length)return;
   e.preventDefault();e.stopPropagation();figure.classList.remove('drag-over');const d=readDrag(e);if(d?.kind!=='image'||d.id===image.id)return;
   change(()=>{const source=findImage(d.id),target=findParent(parent.id)?.item;if(!source||!target)return;const at=target.images.findIndex(i=>i.id===image.id);
    if(source.parent===target)target.images=move(target.images,d.id,at);
    else{source.parent.images=source.parent.images.filter(i=>i.id!==d.id);target.images.splice(at,0,source.image);}
   });toast('Image order updated.');
  };
 }
 return figure;
}
function dropZone(node,parentId){
 if(!canEdit())return;
 node.ondragover=e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();node.classList.add('file-over');}};
 node.ondragleave=e=>{if(!node.contains(e.relatedTarget))node.classList.remove('file-over');};
 node.ondrop=e=>{node.classList.remove('file-over');if(!e.dataTransfer.files.length)return;e.preventDefault();void uploadFiles([...e.dataTransfer.files],parentId);};
}
function render(){
 if(!doc)return;ensureRoute();syncControls();
 $('site-title').textContent=doc.title;$('site-date').textContent=doc.date;$('site-category').textContent=doc.category;
 const nav=$('territories');nav.replaceChildren();
 for(const t of doc.territories){
  const wrap=el('div','territory-item'),b=button(t.name,()=>route(t.id,t.boards[0]?.id));
  b.setAttribute('aria-current',String(t.id===tid));wrap.append(b);
  if(canEdit()){const grip=button('⋮⋮',()=>{selection={kind:'territory',id:t.id};renderInspector();},'drag-grip');grip.title='Drag territory or click to edit';grip.draggable=true;grip.ondragstart=e=>dragData(e,{kind:'territory',id:t.id});wrap.append(grip);
   wrap.ondragover=e=>{e.preventDefault();wrap.classList.add('drag-over')};wrap.ondragleave=()=>wrap.classList.remove('drag-over');wrap.ondrop=e=>reorderTerritory(t.id,e);
  }nav.append(wrap);
 }
 if(canEdit())nav.append(button('Add territory',addTerritory,'add-territory'));
 const content=$('content');content.replaceChildren();const territory=activeTerritory();
 if(!territory){const empty=el('div','empty-board');empty.append(el('h1','','Visual boards'));if(canEdit())empty.append(button('Add a territory',addTerritory,'solid'));content.append(empty);return;}
 const intro=el('header','territory-intro'),heading=el('h1','',territory.name),summary=el('div');
 summary.append(el('p','',territory.description));if(canEdit())summary.append(button('Edit territory',()=>{selection={kind:'territory',id:territory.id};renderInspector();}));
 intro.append(heading,summary);content.append(intro);
 const tabs=el('nav','section-tabs');tabs.setAttribute('aria-label','Boards in '+territory.name);
 for(const b of territory.boards){
  const tab=button(b.title,()=>route(territory.id,b.id),'tab');tab.setAttribute('aria-current',String(!studyMode&&b.id===bid));
  if(canEdit()){
   tab.draggable=true;tab.title='Drag to reorder boards';tab.ondragstart=e=>dragData(e,{kind:'board',id:b.id,territoryId:tid});
   tab.ondragover=e=>{e.preventDefault();};tab.ondrop=e=>{
    e.preventDefault();const d=readDrag(e);if(d?.kind==='board'&&d.territoryId===tid)change(()=>territory.boards=move(territory.boards,d.id,territory.boards.findIndex(x=>x.id===b.id)));
    else if(d?.kind==='image'){change(()=>{const source=findImage(d.id);if(source&&source.parent.id!==b.id){source.parent.images=source.parent.images.filter(i=>i.id!==d.id);b.images.push(source.image);}});route(tid,b.id);toast('Image moved to '+b.title+'.');}
   };
  }tabs.append(tab);
 }
 if(canEdit())tabs.append(button('Add board',()=>addBoard(territory),'tab-add'));
 const studies=button('Brand studies',()=>route(territory.id,'',true),'tab studies-tab');studies.setAttribute('aria-current',String(studyMode));tabs.append(studies);content.append(tabs);
 if(studyMode)renderStudies(content,territory);else renderBoard(content,activeBoard(),territory);
 highlightSelection();
}
function renderBoard(container,board,territory){
 if(!board){const empty=el('div','empty-board','No boards in this territory yet.');if(canEdit())empty.append(button('Add board',()=>addBoard(territory),'solid'));container.append(empty);return;}
 const head=el('div','board-head');head.append(el('h2','',board.title),el('p','',board.description));
 if(canEdit()){const tools=el('div','board-tools');tools.append(button('Edit board',()=>{selection={kind:'board',id:board.id};renderInspector();}),button('Add images',()=>chooseUploads(board.id)));head.append(tools);}
 container.append(head);
 const area=el('div','image-board');area.dataset.boardId=board.id;
 if(board.images.length){
  const grid=el('div','visual-grid count-'+board.images.length+' layout-'+board.layout+(board.images.length>5?' many':''));
  board.images.forEach(i=>grid.append(imageNode(i,board,'board')));area.append(grid);
 }else{const empty=el('div','empty-board','Drop images here to build this board.');if(canEdit())empty.append(button('Choose images',()=>chooseUploads(board.id),'solid'));area.append(empty);}
 dropZone(area,board.id);container.append(area);
 if(canEdit()){const drop=el('div','drop-area');drop.append(el('span','','Drop new images onto the board'),button('Choose files',()=>chooseUploads(board.id)));container.append(drop);dropZone(drop,board.id);}
 const footer=el('div','board-footer'),sources=el('div','board-sources'),seen=new Set();
 for(const i of board.images){if(!i.label||seen.has(i.label))continue;seen.add(i.label);const link=safeURL(i.source);const a=el(link?'a':'span','',i.label);if(link){a.href=link;a.target='_blank';a.rel='noopener noreferrer';}sources.append(a);}
 const pager=el('div','board-pagination'),at=territory.boards.indexOf(board);
 const prev=button('Previous',()=>route(tid,territory.boards[at-1].id));prev.disabled=at===0;
 const next=button('Next',()=>at<territory.boards.length-1?route(tid,territory.boards[at+1].id):route(tid,'',true));
 pager.append(prev,el('span','',(at+1)+' / '+territory.boards.length),next);footer.append(sources,pager);container.append(footer);
}
function renderStudies(container,territory){
 if(canEdit()){const bar=el('div','board-head');bar.append(el('h2','','Relevant brand studies'),button('Add brand study',()=>addStudy(territory)));container.append(bar);}
 for(const study of territory.studies){
  const article=el('article','brand-study');article.dataset.studyId=study.id;
  const photos=el('div','brand-pictures count-'+study.images.length+(study.images.length>2?' many':''));study.images.forEach(i=>photos.append(imageNode(i,study,'study')));dropZone(photos,study.id);
  if(!study.images.length){photos.classList.add('empty-board');if(canEdit())photos.append(button('Add images',()=>chooseUploads(study.id)));}
  const copy=el('div','brand-copy');copy.append(el('h2','',study.name),el('p','brand-category',study.category),el('p','brand-description',study.description));
  const links=el('div','brand-links');for(const [url,label] of [[safeURL(study.website),safeURL(study.website)?new URL(study.website).hostname.replace(/^www\./,''):''],[safeURL(study.instagram),safeURL(study.instagram)?'@'+new URL(study.instagram).pathname.split('/').filter(Boolean)[0]:'']])if(url){const a=el('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a);}
  copy.append(links);
  if(canEdit()){const controls=el('div','brand-edit-tools');controls.append(button('Edit study',()=>{selection={kind:'study',id:study.id};renderInspector();}),button('Add images',()=>chooseUploads(study.id)),button('Move earlier',()=>moveStudy(study.id,-1)),button('Move later',()=>moveStudy(study.id,1)));copy.append(controls);article.draggable=true;article.ondragstart=e=>{if(e.target.closest('.image-frame'))return;dragData(e,{kind:'study',id:study.id});};article.ondragover=e=>e.preventDefault();article.ondrop=e=>{const d=readDrag(e);if(d?.kind==='study'){e.preventDefault();change(()=>territory.studies=move(territory.studies,d.id,territory.studies.findIndex(s=>s.id===study.id)));}};}
  article.append(photos,copy);container.append(article);
 }
 if(!territory.studies.length)container.append(el('div','empty-board','No brand studies in this territory yet.'));
}
function highlightSelection(){document.querySelectorAll('.image-frame').forEach(f=>f.classList.toggle('selected',canEdit()&&selection?.kind==='image'&&selection.id===f.dataset.imageId));}
function field(label,value,update,{type='text',options=null,help=''}={}){
 const wrap=el('label'),cap=el('span','',label);wrap.append(cap);
 const input=el(options?'select':type==='textarea'?'textarea':'input');
 if(options)for(const [v,text] of options){const o=el('option','',text);o.value=v;input.append(o);}
 else if(type!=='textarea')input.type=type;
 input.value=value??'';
 if(type==='range'){input.min='0';input.max='100';input.step='1';}
 let captured=false;
 const capture=()=>{if(!captured){rememberUndo();captured=true;}};
 input.addEventListener('focus',()=>captured=false);
 input.addEventListener('input',()=>{capture();update(input.value);markChanged();render();highlightSelection();});
 if(type==='url')input.addEventListener('change',()=>{if(input.value&&!safeURL(input.value)){const repaired=safeURL('https://'+input.value);if(repaired){input.value=repaired;update(repaired);markChanged();render();}}});
 wrap.append(input);if(help)wrap.append(el('small','hint',help));return wrap;
}
function controlRow(...buttons){const row=el('div','control-row');row.append(...buttons);return row;}
function selectBoard(){const b=activeBoard();return b?{kind:'board',id:b.id}:{kind:'territory',id:tid};}
function renderInspector(){
 const panel=$('inspector');panel.replaceChildren();panel.hidden=!canEdit();if(!canEdit()||!doc)return;
 if(conflict){const notice=el('div');notice.append(el('p','hint','Another tab saved a newer draft. Export your version before loading it.'),button('Export my draft',exportBackup),button('Load latest draft',async()=>{if(await ask('Load the newer draft?','Your current unsaved changes will be replaced. Export a backup first if you want to keep them.'))await loadDraft();}));panel.append(notice);}
 if(!selection)selection=studyMode&&activeTerritory()?.studies[0]?{kind:'study',id:activeTerritory().studies[0].id}:selectBoard();
 if(selection.kind==='site'){
  panel.append(el('h2','','Page details'),el('p','context','Shared header'));
  panel.append(field('Project name',doc.title,v=>doc.title=v),field('Date',doc.date,v=>doc.date=v),field('Category',doc.category,v=>doc.category=v));return;
 }
 if(selection.kind==='image'){
  const found=findImage(selection.id);if(!found){selection=selectBoard();return renderInspector();}
  const {image,parent,kind}=found;
  panel.append(el('h2','','Edit image'),el('p','context',parent.title||parent.name));
  const mini=el('img','mini-preview');mini.src=sourceURL(image);mini.alt=image.alt;panel.append(mini);
  panel.append(field('Brand / label',image.label,v=>image.label=v),field('Caption',image.caption,v=>image.caption=v,{type:'textarea'}),field('Image description',image.alt,v=>image.alt=v),field('Reference link',image.source,v=>image.source=v,{type:'url'}),field('Image fit',image.fit,v=>image.fit=v,{options:[['cover','Fill the frame'],['contain','Show the whole image']]}));
  panel.append(field('Horizontal crop',image.focalX,v=>image.focalX=Number(v),{type:'range'}),field('Vertical crop',image.focalY,v=>image.focalY=Number(v),{type:'range'}));
  if(kind==='board')panel.append(field('Grid span',image.size,v=>{image.size=v;parent.layout='balanced';},{options:[['standard','Standard'],['wide','Wide'],['tall','Tall']],help:'Choosing a span switches this board to a balanced grid.'}));
  const at=parent.images.indexOf(image),earlier=button('Move earlier',()=>change(()=>parent.images=move(parent.images,image.id,at-1))),later=button('Move later',()=>change(()=>parent.images=move(parent.images,image.id,at+1)));earlier.disabled=at===0;later.disabled=at===parent.images.length-1;
  panel.append(controlRow(earlier,later),controlRow(button('Replace image',()=>chooseUploads(parent.id,image.id)),button('Remove image',async()=>{if(await ask('Remove this image?','You can undo this change. The original upload stays available in saved versions.'))change(()=>{parent.images=parent.images.filter(i=>i.id!==image.id);selection={kind,id:parent.id};});},'danger')));
  panel.append(button('Back to '+(kind==='study'?'brand study':'board'),()=>{selection={kind,id:parent.id};renderInspector();}));return;
 }
 if(selection.kind==='territory'){
  const t=doc.territories.find(t=>t.id===selection.id);if(!t){selection=selectBoard();return;}
  panel.append(el('h2','','Edit territory'),el('p','context',t.name),field('Name',t.name,v=>t.name=v),field('Description',t.description,v=>t.description=v,{type:'textarea'}));
  const at=doc.territories.indexOf(t),before=button('Move earlier',()=>change(()=>doc.territories=move(doc.territories,t.id,at-1))),after=button('Move later',()=>change(()=>doc.territories=move(doc.territories,t.id,at+1)));before.disabled=at===0;after.disabled=at===doc.territories.length-1;
  panel.append(controlRow(before,after),controlRow(button('Add board',()=>addBoard(t)),button('Add brand study',()=>addStudy(t))),controlRow(button('Remove territory',async()=>{if(await ask('Remove this territory?','Its boards and brand studies will be removed from the draft. You can undo this change.'))change(()=>{doc.territories=doc.territories.filter(x=>x.id!==t.id);selection=null;});},'danger')));return;
 }
 const found=findParent(selection.id);if(!found){selection=null;return renderInspector();}
 const {item,territory,kind}=found;
 panel.append(el('h2','',kind==='board'?'Edit board':'Edit brand study'),el('p','context',territory.name));
 panel.append(field(kind==='board'?'Board title':'Brand name',item.title??item.name,v=>{if(kind==='board')item.title=v;else item.name=v;}));
 if(kind==='study')panel.append(field('Product category',item.category,v=>item.category=v));
 panel.append(field('Description',item.description,v=>item.description=v,{type:'textarea'}));
 if(kind==='board')panel.append(field('Layout',item.layout,v=>item.layout=v,{options:[['editorial','Feature image'],['balanced','Balanced grid'],['wall','Contact sheet']]}));
 else panel.append(field('Website',item.website,v=>item.website=v,{type:'url'}),field('Instagram URL',item.instagram,v=>item.instagram=v,{type:'url'}));
 panel.append(controlRow(button('Upload images',()=>chooseUploads(item.id),'solid')));
 const urlWrap=el('label'),urlCap=el('span','','Add an image URL'),urlInput=el('input');urlInput.type='url';urlInput.placeholder='https://…';urlWrap.append(urlCap,urlInput);
 panel.append(urlWrap,button('Add URL',()=>{const url=safeURL(urlInput.value,{image:true});if(!url){toast('Enter a complete HTTPS image URL.');return;}change(()=>item.images.push(newImage({src:url,label:'',source:url})));}));
 const order=el('div','image-order');for(const i of item.images){const b=button('',()=>{selection={kind:'image',id:i.id,parentId:item.id};highlightSelection();renderInspector();});b.title='Edit '+(i.label||'image');const im=el('img');im.src=sourceURL(i);im.alt=i.label||'Image';b.append(im);order.append(b);}panel.append(order,el('p','hint','Drag images on the board to reorder them. Select an image to adjust its crop, label or source.'));
 const list=kind==='board'?territory.boards:territory.studies,at=list.indexOf(item);
 const earlier=button('Move earlier',()=>change(()=>{if(kind==='board')territory.boards=move(list,item.id,at-1);else territory.studies=move(list,item.id,at-1);})),later=button('Move later',()=>change(()=>{if(kind==='board')territory.boards=move(list,item.id,at+1);else territory.studies=move(list,item.id,at+1);}));earlier.disabled=at===0;later.disabled=at===list.length-1;
 panel.append(controlRow(earlier,later),controlRow(button('Duplicate',()=>{const copy=clone(item);copy.id=uid();copy.images.forEach(i=>i.id=uid());if(kind==='board')copy.title+=' copy';else copy.name+=' copy';change(()=>{list.splice(at+1,0,copy);selection={kind,id:copy.id};if(kind==='board')bid=copy.id;});}),button('Remove '+kind,async()=>{if(await ask('Remove this '+kind+'?','You can undo this change or restore a saved version.'))change(()=>{if(kind==='board')territory.boards=territory.boards.filter(x=>x.id!==item.id);else territory.studies=territory.studies.filter(x=>x.id!==item.id);selection=null;});},'danger')));
}
function newImage(values){return {id:uid(),src:'',label:'',caption:'',alt:'',source:'',fit:'cover',focalX:50,focalY:50,size:'standard',...values};}
function addTerritory(){const t={id:uid(),name:'New territory',description:'',boards:[],studies:[]};change(()=>{doc.territories.push(t);tid=t.id;bid='';selection={kind:'territory',id:t.id};studyMode=false;});}
function addBoard(t){const b={id:uid(),title:'New board',description:'',layout:'editorial',images:[]};change(()=>{t.boards.push(b);tid=t.id;bid=b.id;studyMode=false;selection={kind:'board',id:b.id};});}
function addStudy(t){const s={id:uid(),name:'New brand',category:'',description:'',website:'',instagram:'',images:[]};change(()=>{t.studies.push(s);studyMode=true;tid=t.id;selection={kind:'study',id:s.id};});}
function moveStudy(id,step){const found=findParent(id);if(!found)return;change(()=>found.territory.studies=move(found.territory.studies,id,found.territory.studies.findIndex(x=>x.id===id)+step));}
function chooseUploads(parentId,replaceId=null){uploadTarget={parentId,replaceId};$('image-files').multiple=!replaceId;$('image-files').value='';$('image-files').click();}
async function compressImage(file){
 if(file.size>25*1024*1024)throw Error(file.name+' is larger than 25 MB.');
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw Error('Choose JPG, PNG, WebP or GIF images.');
 if(file.type==='image/gif'){if(file.size>10*1024*1024)throw Error('GIF files must be smaller than 10 MB.');return file;}
 const bitmap=await createImageBitmap(file);
 const scale=Math.min(1,2600/Math.max(bitmap.width,bitmap.height));
 if(scale===1&&file.size<1200000){bitmap.close();return file;}
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));if(!blob)throw Error('Could not prepare this image.');return blob;
}
async function uploadFiles(files,parentId,replaceId=null){
 if(!editing||loading)return;const parent=findParent(parentId)?.item;if(!parent)return;
 const limit=replaceId?1:60-parent.images.length,chosen=files.slice(0,limit);if(!chosen.length){toast('This board already has 60 images.');return;}
 loading=true;syncControls();const successes=[];const errors=[];
 for(let i=0;i<chosen.length;i++){toast('Uploading image '+(i+1)+' of '+chosen.length+'…',0);try{const raw=await compressImage(chosen[i]),result=await api('/upload',{method:'POST',body:raw,raw:true});previews[result.assetId]=result.preview;successes.push(newImage({src:result.src,assetId:result.assetId,label:chosen[i].name.replace(/\.[^.]+$/,''),alt:chosen[i].name.replace(/\.[^.]+$/,'')}));}catch(e){errors.push(chosen[i].name+': '+e.message);}}
 if(successes.length)change(()=>{const current=findParent(parentId)?.item;if(!current)return;if(replaceId){const previous=current.images.find(i=>i.id===replaceId);if(previous)Object.assign(previous,{src:successes[0].src,assetId:successes[0].assetId,fallbackSrc:''});}else current.images.push(...successes);selection={kind:'image',id:replaceId||successes[0].id,parentId};});
 loading=false;syncControls();toast(errors.length?successes.length+' uploaded. '+errors.join(' '):successes.length+' image'+(successes.length===1?'':'s')+' added to the draft.',errors.length?9000:4200);
}
function exportBackup(){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}));a.href=url;a.download='nakedpak-visual-boards-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function openLightbox(images,index){lightImages=images;lightIndex=index;showLightboxImage();$('lightbox').showModal();}
function showLightboxImage(){const i=lightImages[lightIndex];if(!i)return;$('lightbox-img').src=sourceURL(i);$('lightbox-img').alt=i.alt||i.label;$('lightbox-label').textContent=i.label;$('lightbox-caption').textContent=i.caption;$('lightbox-source').hidden=!safeURL(i.source);if(safeURL(i.source))$('lightbox-source').href=safeURL(i.source);$('lightbox-prev').disabled=lightIndex===0;$('lightbox-next').disabled=lightIndex===lightImages.length-1;}
async function loadDraft({recover=false}={}){
 const result=await api('/draft');doc=validateDocument(result.document);revision=result.revision;publishedRevision=result.publishedRevision;previews=result.previews||{};
 conflict=false;saveError='';dirty=false;undoStack=[];redoStack=[];selection=null;editing=true;previewing=false;
 if(recover){try{const prior=JSON.parse(localStorage.getItem(RECOVERY)||'null');if(prior&&Date.now()-prior.at<604800000&&prior.revision===revision&&JSON.stringify(prior.document)!==JSON.stringify(doc)&&await ask('Recover unsaved edits?','This browser kept a draft that had not finished saving.')){doc=validateDocument(prior.document);markChanged();}}catch{}}
 parseRoute();render();renderInspector();
}
async function unlock(key){
 $('unlock-status').textContent='Opening editor…';
 try{const result=await api('/unlock',{method:'POST',body:{key}});saveSession(result);await loadDraft({recover:true});$('editor-key').value='';$('unlock-status').textContent='';$('unlock-dialog').close();toast('Editor open. Changes save to a draft until you publish.');}
 catch(e){$('unlock-status').textContent=e.message;if(!$('unlock-dialog').open)$('unlock-dialog').showModal();}
}
async function savedVersions(){
 if(!await flush())return;$('versions-dialog').showModal();$('versions-list').textContent='Loading…';
 try{const versions=await api('/history');$('versions-list').replaceChildren();for(const v of versions){const row=el('div','version-row'),label=el('span','',new Date(v.created_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}));label.append(el('small','',(v.published?'Published':'Draft')+' · version '+v.revision));const restore=button('Restore',async()=>{const result=await api('/history/'+v.revision);change(()=>{doc=validateDocument(result.document);Object.assign(previews,result.previews||{});selection=null;});$('versions-dialog').close();toast('Restored to the draft. Publish to update the shared boards.');});row.append(label,restore);$('versions-list').append(row);}}
 catch(e){$('versions-list').textContent=e.message;}
}
$('image-files').onchange=e=>{if(uploadTarget&&e.target.files.length)void uploadFiles([...e.target.files],uploadTarget.parentId,uploadTarget.replaceId);};
$('publish').onclick=publish;
$('edit-toggle').onclick=()=>{if(editing){previewing=false;render();renderInspector();if(innerWidth<761)$('inspector').scrollIntoView({behavior:'smooth'});}else if(token)void loadDraft().catch(()=>{token='';$('unlock-dialog').showModal();});else $('unlock-dialog').showModal();};
$('unlock-form').onsubmit=e=>{e.preventDefault();void unlock($('editor-key').value.trim());};
$('preview-mode').onclick=()=>{previewing=!previewing;render();renderInspector();};
$('site-settings').onclick=()=>{previewing=false;selection={kind:'site'};render();renderInspector();};
$('undo').onclick=()=>{if(!undoStack.length)return;redoStack.push(JSON.stringify(doc));doc=JSON.parse(undoStack.pop());selection=null;markChanged();render();renderInspector();};
$('redo').onclick=()=>{if(!redoStack.length)return;undoStack.push(JSON.stringify(doc));doc=JSON.parse(redoStack.pop());selection=null;markChanged();render();renderInspector();};
$('history').onclick=savedVersions;$('export').onclick=exportBackup;
$('lock-editor').onclick=async()=>{if(!await flush())return;await api('/logout',{method:'POST'}).catch(()=>{});sessionStorage.removeItem(SESSION);token='';editing=false;previewing=false;const r=await api();doc=validateDocument(r.document);revision=publishedRevision=r.revision;selection=null;render();renderInspector();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('lightbox-prev').onclick=()=>{if(lightIndex>0){lightIndex--;showLightboxImage();}};
$('lightbox-next').onclick=()=>{if(lightIndex<lightImages.length-1){lightIndex++;showLightboxImage();}};
document.addEventListener('keydown',e=>{
 if(e.target.closest('input,textarea,select,[contenteditable]'))return;
 if($('lightbox').open){if(e.key==='ArrowLeft')$('lightbox-prev').click();if(e.key==='ArrowRight')$('lightbox-next').click();return;}
 if(editing&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}
});
window.addEventListener('beforeunload',e=>{if(dirty||saving||loading){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>{if(dirty)void flush();});
window.addEventListener('hashchange',()=>{parseRoute();render();renderInspector();});
async function init(){
 let key='';if(location.hash.startsWith('#edit=')){key=decodeURIComponent(location.hash.slice(6));history.replaceState(null,'',location.pathname);}
 try{const saved=JSON.parse(sessionStorage.getItem(SESSION)||'null');if(saved?.expiresAt>Date.now())token=saved.token;else sessionStorage.removeItem(SESSION);}catch{}
 try{const result=await api();doc=validateDocument(result.document);revision=publishedRevision=result.revision;}
 catch{try{doc=validateDocument(await (await fetch('./seed.json')).json());toast('Showing the saved edition. Reconnect to edit.');}catch{$('content').replaceChildren(el('div','loading','The boards could not load. Please refresh.'));return;}}
 parseRoute();render();
 if(key)await unlock(key);
 else if(token)try{await loadDraft({recover:true});}catch{token='';sessionStorage.removeItem(SESSION);editing=false;render();}
}
void init();

