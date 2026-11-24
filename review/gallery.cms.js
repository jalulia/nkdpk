(()=>{'use strict';
const D=JSON.parse(document.getElementById('data').textContent), $=s=>document.getElementById(s), Q=(tag,cls,txt)=>{let a=document.createElement(tag); if(cls)a.className=cls;if(txt)a.textContent=txt;return a};
const readOnly=globalThis.NakedPakReadOnly===true;
const CMS=globalThis.NakedPakCMS,S=CMS.createStore({storage:globalThis.NakedPakCMSStorage});
let current=D.decks[0], page=current?.start??0, group='All', origin=null, dialog=$('lightbox'), stage=$('stage'), historyPages=new Map(), startX=0, mode='active';
const keys=d=>CMS.deckKey(d);
const itemKey=(d,i)=>CMS.slideKey(d,d.slides[i]);
const pickable=d=>d.slides.map((s,i)=>i).filter(i=>S.visible(keys(d),itemKey(d,i),mode));
const eligible=()=>D.decks.filter(d=>(group==='All'||d.group===group)&&pickable(d).length);
const target=()=>$('cms-scope').value==='deck'?keys(current):itemKey(current,page);
const transition=(d,i,dir)=>{let l=pickable(d),k=l.indexOf(i);return l[k+dir]};
const setStatus=t=>{$('cms-status').textContent=[t,S.issue].filter(Boolean).join(' ')};
const groups=['All',...new Set(D.decks.map(x=>x.group))];
function controls(){let n=current.slides.length;$('number').textContent=String(page+1).padStart(2,'0')+' / '+String(n).padStart(2,'0');$('lcount').textContent=(page+1)+' / '+n;$('prev').disabled=$('lprev').disabled=transition(current,page,-1)===undefined;$('next').disabled=$('lnext').disabled=transition(current,page,1)===undefined}
function figure(){let s=current.slides[page];$('slide').src=D.pictures[s.key];$('slide').alt=current.title+' — '+s.label;$('slide-label').textContent=s.label;if(dialog.open){$('limage').src=D.pictures[s.key];$('limage').alt=$('slide').alt}controls();
for(let b of $('strip').children)b.setAttribute('aria-current',String(Number(b.dataset.index)===page));
let thumb=[...$('strip').children].find(b=>Number(b.dataset.index)===page);if(thumb){let el=$('strip');if(thumb.offsetLeft<el.scrollLeft||thumb.offsetLeft+thumb.offsetWidth>el.scrollLeft+el.clientWidth)el.scrollTo({left:Math.max(0,thumb.offsetLeft-el.offsetLeft-25),behavior:'auto'})}if(current)refreshActions();}
function switchPage(i){if(!current||!pickable(current).includes(i)||i===page)return;page=i;historyPages.set(current.id,page);figure()}
function imgs(key,alt='',small=true){let a=Q('img');a.src=small?(D.thumbnails[key]||D.pictures[key]):D.pictures[key];a.alt=alt;a.loading='lazy';a.decoding='async';return a}
function sources(links,container){container.replaceChildren();links.forEach(o=>{let href=(D.bundle&&o.local)?o.local:o.url;if(!href)return;let a=Q('a','',o.title+' '+(href.startsWith('https:')?'↗':'→'));a.setAttribute('href',href);if(href.startsWith('https:')){a.target='_blank';a.rel='noopener'} container.append(a)})}
function category(){for(let b of $('filters').children)b.setAttribute('aria-pressed',String(b.dataset.group===group))}
function rail(){let c=$('deckrail');c.replaceChildren();for(let d of eligible()){let b=Q('button','deckbutton');b.id='deck-'+d.id;b.setAttribute('aria-current',String(d===current));b.title=d.title+' · '+d.tag;const p=pickable(d);b.append(imgs(d.slides[p.includes(d.start)?d.start:p[0]].key));let t=Q('span','',d.title);t.append(Q('small','',d.tag));b.append(t);b.onclick=()=>select(d.id,false,true);c.append(b)}}
function refreshDeck(){ $('decktitle').textContent=current.title;$('version').textContent=current.group+' / '+current.tag;$('caption').textContent=current.caption;sources(current.links,$('decklinks'));
let strip=$('strip'); strip.replaceChildren();pickable(current).forEach(i=>{let s=current.slides[i],b=Q('button','thumb');b.dataset.index=String(i);b.setAttribute('aria-label','Go to '+s.label+' ('+(i+1)+')');b.title=s.label;b.append(imgs(s.key),Q('span','',String(i+1).padStart(2,'0')));b.onclick=()=>switchPage(i);strip.append(b)});strip.scrollLeft=0;figure()
}
function select(id,scroll=false,keepfocus=false){
  let next=eligible().find(d=>d.id===id);if(!next)return;
  current=next; const available=pickable(next), remembered=historyPages.get(id)??next.start;
  page=available.includes(remembered)?remembered:available[0];
  for(let b of $('deckrail').children)b.setAttribute('aria-current',String(b.id==='deck-'+id));
  $('gallery-content').hidden=false;$('cms-empty').hidden=true;$('cms-actions').hidden=false;
  refreshDeck();if(scroll)$('viewer').scrollIntoView({block:'start'});
  if(keepfocus)$('deck-'+id)?.focus({preventScroll:true});
}
function renderView(){
  rail(); category();
  const choices=eligible(); if(choices.length){select(choices.some(d=>d===current)?current.id:choices[0].id);}
  else {current=null;$('gallery-content').hidden=true;$('cms-actions').hidden=true;$('cms-empty').hidden=false;}
}
function showMode(){
  $('cms-mode').value=mode;
  $('cms-empty').textContent=mode==='archived'?'Nothing is archived in this workstream.':mode==='flagged'?'Nothing is flagged in this workstream.':mode.startsWith('group:')?'Nothing in this group matches this workstream.':'No active slides in this workstream.';
}
function resetMode(){fillSelect();showMode();renderView()}
function refreshActions(){
  const key=target(), m=S.read(key), inherited=key.startsWith('item/')&&S.read(keys(current)).archive;
  $('cms-flag').textContent=m.flag?'★  Unflag':'☆  Flag';$('cms-flag').setAttribute('aria-pressed',String(m.flag));
  $('cms-archive').textContent=m.archive?'Restore':'Archive';$('cms-archive').disabled=inherited&&!m.archive;
  $('cms-archive').title=inherited?'The whole deck is archived. Select This deck to restore it.':'Hide this item from active review';
  $('cms-groups-title').textContent='Groups'+(m.groups.length?' ('+m.groups.length+')':'');
  const box=$('cms-group-options');box.replaceChildren();
  for(const g of S.snapshot().groups){
    let label=Q('label'), tag=Q('span','',g.name), cb=Q('input');cb.type='checkbox';cb.checked=m.groups.includes(g.id);
    cb.addEventListener('change',()=>act(()=>S.setGroup(g.id,key,cb.checked),cb.checked?'Added to '+g.name+'.':'Removed from '+g.name+'.'));
    label.append(cb,tag);box.append(label);
  }
}
function fillSelect(){
  const opts=[['active','Active'],['flagged','Flagged'],['archived','Archived'],...S.snapshot().groups.map(g=>['group:'+g.id,g.name])];
  if(!opts.some(([id])=>id===mode))mode='active';
  $('cms-mode').replaceChildren(...opts.map(([id,name])=>{let o=Q('option','',name);o.value=id;return o}));
  const mg=$('cms-manage-list'), open=mg.value;
  mg.replaceChildren(...S.snapshot().groups.map(g=>{let o=Q('option','',g.name);o.value=g.id;return o}));
  if(S.snapshot().groups.some(g=>g.id===open))mg.value=open;
  $('cms-rename').disabled=$('cms-delete').disabled=!mg.options.length;
}
function act(fn,msg){try{fn();setStatus(msg);$('cms-undo').disabled=false;resetMode();}catch(e){setStatus(e.message)}}
if(!readOnly){
$('cms-scope').addEventListener('change',()=>current&&refreshActions());
$('cms-mode').addEventListener('change',e=>{mode=e.target.value;group='All';showMode();renderView()});
$('cms-flag').onclick=()=>{const k=target(),was=S.read(k).flag;act(()=>S.toggleFlag(k),was?'Flag removed.':'Flag added.')};
$('cms-archive').onclick=()=>{const k=target(),was=S.read(k).archive;act(()=>S.toggleArchive(k),was?'Restored to active review.':'Archived. Original unchanged.')};
$('cms-group-form').addEventListener('submit',e=>{e.preventDefault();const box=$('cms-new-group');act(()=>{S.addGroup(box.value);box.value=''},'Group created.')});
$('cms-rename').onclick=()=>act(()=>{const box=$('cms-edit-group');S.renameGroup($('cms-manage-list').value,box.value);box.value=''},'Group renamed.');
$('cms-delete').onclick=()=>act(()=>S.deleteGroup($('cms-manage-list').value),'Group removed. Review items are unchanged.');
$('cms-undo').onclick=()=>{if(S.undo()){resetMode();setStatus('Undid last change.');$('cms-undo').disabled=true}};
$('cms-export').onclick=()=>{const href=URL.createObjectURL(new Blob([S.export()],{type:'application/json'}));const a=Q('a');a.href=href;a.download='nakedpak-review-organization.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1500);setStatus('Exported review settings only.')};
$('cms-import-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>CMS.LIMIT)throw Error('This backup is too large.');const candidate=CMS.parse(await f.text());$('cms-import-confirm').onclick=()=>{act(()=>S.replace(candidate),'Backup imported.');$('cms-confirm').close();};$('cms-confirm').showModal()}catch(err){setStatus(err.message)}finally{e.target.value=''}});
$('cms-import-cancel').onclick=()=>$('cms-confirm').close();
}

for(let g of groups){let b=Q('button','',g);b.dataset.group=g;b.onclick=()=>{group=g;renderView()};$('filters').append(b)}
for(let [id,tag,title,key] of D.hero){let b=Q('button','hero-item');b.append(imgs(key,title,false));let t=Q('span','hero-cap');let text=Q('span','',title);text.prepend(Q('span','hero-type',tag));t.append(text,Q('span','','↘'));b.append(t);b.onclick=()=>{const d=D.decks.find(d=>d.id===id);if(!d)return;group='All';mode=d.slides.some((s,i)=>S.visible(keys(d),itemKey(d,i),'active'))?'active':'archived';resetMode();select(id,true)};$('heroes').append(b)}
function full(){if(!current)return;origin=document.activeElement;dialog.showModal();$('lightimage').classList.remove('zoomed');$('zoom').setAttribute('aria-pressed','false');figure();$('close').focus()}
function zoom(){let a=$('lightimage').classList.toggle('zoomed');$('zoom').setAttribute('aria-pressed',String(a));$('zoom').textContent=a?'Fit':'100%'}
$('expand').onclick=full;$('slide').onclick=full;$('close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{origin?.focus();$('zoom').textContent='100%'});$('zoom').onclick=zoom;$('limage').onclick=zoom;
['prev','lprev'].forEach(x=>$(x).onclick=()=>switchPage(current?transition(current,page,-1):-1));['next','lnext'].forEach(x=>$(x).onclick=()=>switchPage(current?transition(current,page,1):-1));
document.addEventListener('keydown',e=>{if(e.altKey||e.metaKey||e.ctrlKey||e.target.closest('input, textarea, select'))return;if(!current||(!dialog.open&&!e.target.closest('#gallery-content')))return;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const a=pickable(current);switchPage(e.key==='ArrowLeft'?transition(current,page,-1):e.key==='ArrowRight'?transition(current,page,1):e.key==='Home'?a[0]:a[a.length-1])}});
stage.addEventListener('touchstart',e=>{startX=e.changedTouches[0].clientX},{passive:true});stage.addEventListener('touchend',e=>{let dx=e.changedTouches[0].clientX-startX;if(current&&Math.abs(dx)>45)switchPage(transition(current,page,dx<0?1:-1))},{passive:true});
resetMode();setStatus('');sources(D.sources,$('source-links'));if(!D.bundle)$('source-intro').textContent+=' Open the iCloud folder edition for links to local files.';
})();
