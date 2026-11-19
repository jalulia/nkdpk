(() => {
  const key = new URLSearchParams(location.hash.slice(1)).get('k') || '';
  const el = id => document.getElementById(id);
  const count = new Intl.NumberFormat('en-US');
  const shortDate = day => new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
  if (!/^[a-zA-Z0-9_-]{43}$/.test(key)) { el('access').hidden=false;return; }
  el('panel').hidden=false;
  const endpoint='https://ycolvxmvcmxfnuicgfay.supabase.co/functions/v1/nkdpk-stats';
  let request;

  function bars(data) {
    const max=Math.max(1,...data.map(d=>Math.max(d.study_opens,d.index_views)));
    const nodes=data.map(d=>{
      const group=document.createElement('button');group.type='button';
      group.className='bars';group.tabIndex=0;
      const label=shortDate(d.day)+': '+d.index_views+' index views, '+d.study_opens+' study opens';
      group.title=label;group.setAttribute('aria-label',label);group.addEventListener('click',()=>{el('day-detail').textContent=label;el('day-detail').hidden=false;});
      for(const field of ['index_views','study_opens']){
        const bar=document.createElement('span');bar.className=field==='study_opens'?'bar study':'bar';
        bar.style.height=(d[field]*100/max)+'%';group.append(bar);
      }
      return group;
    });
    el('plot').replaceChildren(...nodes);el('day-detail').hidden=true;
    el('first').textContent=shortDate(data[0].day);el('last').textContent=shortDate(data.at(-1).day);
  }
  function ranking(boards) {
    el('empty').hidden=boards.length>0;
    el('boards').replaceChildren(...boards.map(b=>{
      const row=document.createElement('li'), number=document.createElement('span'),
        title=document.createElement('span'), total=document.createElement('strong');
      number.className='board-num';number.textContent=b.item.slice(4).replace(/^0/,'');
      title.className='board-name';title.textContent=b.title;total.textContent=count.format(b.opens);
      row.append(number,title,total);return row;
    }));
  }
  async function refresh() {
    request?.abort();const controller=new AbortController();request=controller;
    el('refresh').disabled=true;el('status').textContent='Loading activity…';el('report').hidden=true;
    try {
      const url=new URL(endpoint);url.searchParams.set('days',el('range').value);
      const res=await fetch(url,{signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',headers:{'X-Stats-Key':key}});
      if(!res.ok)throw Error(res.status===401?'Open your private stats link to view activity.':'Stats could not load. Try Refresh.');
      const data=await res.json();
      if(controller.signal.aborted)return;
      el('index-count').textContent=count.format(data.index_views);el('study-count').textContent=count.format(data.study_opens);
      el('link-count').textContent=count.format(data.index_clicks);bars(data.daily);ranking(data.boards);
      const time=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}).format(new Date(data.as_of));
      el('status').textContent='Updated '+time;el('report').hidden=false;
    } catch(err) {
      if(controller.signal.aborted)return;
      el('status').textContent=err.message==='Failed to fetch'?'Stats could not load. Check your connection and try Refresh.':err.message;
    } finally {if(request===controller)el('refresh').disabled=false;}
  }
  el('range').addEventListener('change',refresh);el('refresh').addEventListener('click',refresh);refresh();
})();
