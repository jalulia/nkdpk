(() => {
  const gate = document.getElementById('gate'), form = document.getElementById('unlock');
  const status = document.getElementById('message'), frame = document.getElementById('viewer');
  const input = document.getElementById('review-link');
  const params = new URLSearchParams(location.hash.slice(1));
  const allowed = /^(project|ledger|inputs|sources(?:\/[\w-]+)?|reference\/[\w-]+|(?:board|sample|pin)\/[1-9]\d{0,2})$/;
  const clean = value => allowed.test(value || '') ? value : 'board/1';
  const initialRoute = clean(params.get('v') || new URLSearchParams(location.search).get('open'));
  const validKey = s => /^[A-Za-z0-9_-]{43}$/.test(s || '');
  let objectURL, currentKey;
  function syncRoute() {
    const v = clean(frame.contentWindow.location.hash.slice(1));
    const next = new URLSearchParams({k:currentKey, v});
    history.replaceState(null, '', location.pathname + '#' + next);
    window.dispatchEvent(new CustomEvent('nakedpakreview', {detail:v}));
  }
  async function open(key) {
    if (!validKey(key)) { status.textContent = 'Paste the complete private review link, including the part after #.'; return; }
    form.hidden = true;status.textContent = 'Opening the study…';
    try {
      const raw = Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='), c => c.charCodeAt(0));
      const secret = await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
      const response = await fetch('study.bin', {cache:'no-cache', referrerPolicy:'no-referrer'});
      if (!response.ok) throw Error('Study unavailable');
      const payload = new Uint8Array(await response.arrayBuffer());
      const compressed = await crypto.subtle.decrypt({name:'AES-GCM',iv:payload.subarray(0,12)},secret,payload.subarray(12));
      const plain = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      const documentHTML = plain.replace('<head>', '<head><meta name="referrer" content="no-referrer">');
      objectURL = URL.createObjectURL(new Blob([documentHTML], {type:'text/html'}));
      currentKey=key; input.value='';
      frame.addEventListener('load', () => {
        gate.hidden = true;frame.hidden = false;
        frame.contentWindow.addEventListener('hashchange',syncRoute);
        syncRoute();
      }, {once:true});
      frame.src=objectURL+'#'+initialRoute;
    } catch {
      status.textContent = 'The study could not open. Check the review link and your connection, then try again.';
      form.hidden=false;
    }
  }
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const value=input.value.trim();
    const fragment=value.includes('#')?value.slice(value.indexOf('#')+1):'';
    open(new URLSearchParams(fragment).get('k'));
  });
  if (params.has('k')) open(params.get('k'));
})();
