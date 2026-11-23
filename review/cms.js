/* NakedPak review organization. Stores only personal metadata, never source files. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NakedPakCMS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=1, KEY='nakedpak.review.organization.v1', LIMIT=256*1024;
  const KEYS=['archive','flag','groups'];
  const idOk=s=>typeof s==='string'&&/^(?:deck\/[a-zA-Z0-9_-]{1,95}|item\/[a-zA-Z0-9_-]{1,95}\/[a-zA-Z0-9_-]{1,95})$/.test(s);
  const groupIdOk=s=>typeof s==='string'&&/^g-[a-zA-Z0-9-]{1,64}$/.test(s);
  const newState=()=>({version:VERSION,groups:[],items:Object.create(null)});
  function cleanName(input){return typeof input==='string'?input.trim().replace(/\s+/g,' ').slice(0,44):''}
  function validate(value){
    if(!value||value.version!==VERSION||!Array.isArray(value.groups)||!value.items||Array.isArray(value.items)||typeof value.items!=='object')throw Error('This is not a NakedPak review backup.');
    if(value.groups.length>90||Object.keys(value.items).length>1600)throw Error('This backup is too large.');
    const out=newState(),groupids=new Set(),names=new Set();
    for(const g of value.groups){
      const name=cleanName(g?.name);
      if(!groupIdOk(g?.id)||!name||groupids.has(g.id)||names.has(name.toLowerCase()))throw Error('The backup contains an invalid or duplicate group.');
      out.groups.push({id:g.id,name});groupids.add(g.id);names.add(name.toLowerCase());
    }
    for(const [key,obj] of Object.entries(value.items)){
      if(!idOk(key)||!obj||Array.isArray(obj)||typeof obj!=='object'||Object.keys(obj).some(x=>!KEYS.includes(x))||
        (obj.archive!==undefined&&typeof obj.archive!=='boolean')||(obj.flag!==undefined&&typeof obj.flag!=='boolean')||
        (obj.groups!==undefined&&(!Array.isArray(obj.groups)||obj.groups.length>90||obj.groups.some(id=>!groupids.has(id)))))throw Error('The backup contains invalid item settings.');
      const groups=[...new Set(obj.groups||[])];
      if(obj.archive||obj.flag||groups.length)out.items[key]={archive:!!obj.archive,flag:!!obj.flag,groups};
    }
    return out;
  }
  function parse(input){
    if(typeof input!=='string'||input.length>LIMIT)throw Error('This backup is too large.');
    let obj;try{obj=JSON.parse(input)}catch{throw Error('This is not a valid JSON backup.')}
    return validate(obj);
  }
  function createStore({storage, key=KEY, makeGroupId}={}){
    let state=newState(), issue='', durable=!!storage, previous=null;
    try{const text=storage?.getItem(key);if(text)state=parse(text)}
    catch{issue='Saved review settings could not be read. Controls still work for this session.';durable=false;}
    function snapshot(){return validate(state)}
    function commit(next){
      previous=state;
      state=validate(next);
      if(!durable)return false;
      try{storage.setItem(key,JSON.stringify(state));issue='';return true}
      catch{issue='Changes are only saved for this session. Export a backup before closing.';durable=false;return false}
    }
    function lookup(key){return state.items[key]||{archive:false,flag:false,groups:[]}}
    function update(key,changes){
      if(!idOk(key))throw Error('Could not identify this item.');
      const next=snapshot();next.items[key]={...lookup(key),...changes};
      return commit(next);
    }
    function addGroup(value){
      const name=cleanName(value);
      if(!name)throw Error('Enter a group name.');
      if(state.groups.some(g=>g.name.toLowerCase()===name.toLowerCase()))throw Error('A group already has that name.');
      if(state.groups.length>=90)throw Error('This review has reached its group limit.');
      const id=(makeGroupId||(()=>('g-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)))))();
      const next=snapshot();next.groups.push({id,name});commit(next);return id;
    }
    function setGroup(id,item,include){
      if(!state.groups.some(g=>g.id===id))throw Error('That group does not exist.');
      let groups=lookup(item).groups.filter(g=>g!==id);
      if(include)groups.push(id);
      return update(item,{groups});
    }
    function renameGroup(id,value){
      const name=cleanName(value);
      if(!name)throw Error('Enter a group name.');
      if(!state.groups.some(g=>g.id===id))throw Error('That group does not exist.');
      if(state.groups.some(g=>g.id!==id&&g.name.toLowerCase()===name.toLowerCase()))throw Error('A group already has that name.');
      const next=snapshot();next.groups.find(g=>g.id===id).name=name;return commit(next);
    }
    function deleteGroup(id){
      if(!state.groups.some(g=>g.id===id))throw Error('That group does not exist.');
      const next=snapshot();next.groups=next.groups.filter(g=>g.id!==id);
      for(const item of Object.values(next.items))item.groups=item.groups.filter(g=>g!==id);
      return commit(next);
    }
    function intersects(items,id){return items.some(i=>lookup(i).groups.includes(id))}
    function visible(deck,slide,filter='active'){
      const dp=lookup(deck),sp=lookup(slide), archived=dp.archive||sp.archive;
      return filter==='archived'?archived:!archived&&(filter==='flagged'?(dp.flag||sp.flag):
        filter.startsWith('group:')?intersects([deck,slide],filter.slice(6)):true);
    }
    return {snapshot,read:key=>({...lookup(key),groups:[...lookup(key).groups]}),
      toggleArchive:key=>update(key,{archive:!lookup(key).archive}),toggleFlag:key=>update(key,{flag:!lookup(key).flag}),
      addGroup,renameGroup,setGroup,deleteGroup,visible,replace:backup=>commit(typeof backup==='string'?parse(backup):validate(backup)),
      undo(){if(!previous)return false;const old=previous;commit(old);previous=null;return true;},
      export(){return JSON.stringify(state,null,2)},get durable(){return durable},get issue(){return issue||(!durable?'This tab cannot save review settings. Export a backup before closing.':'')}};
  }
  const deckKey=deck=>'deck/'+deck.id;
  const slideKey=(deck,slide)=>'item/'+deck.id+'/'+slide.key;
  return {createStore,deckKey,slideKey,parse,validate,KEY,LIMIT};
});
