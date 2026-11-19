// Cookie-free counts for the hosted project index. All identifiers are scoped to one load.
(() => {
  if (location.origin !== 'https://jalulia.github.io' ||
      !['/nkdpk/', '/nkdpk/index.html'].includes(location.pathname) ||
      window.top !== window.self || navigator.webdriver ||
      navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  try {
    if (Object.prototype.hasOwnProperty.call(localStorage, 'tools.token')) return;
  } catch { /* Storage can be disabled. The tracker does not need it. */ }

  const endpoint = 'https://ycolvxmvcmxfnuicgfay.supabase.co/rest/v1/nkdpk_events';
  const publicKey = 'sb_publishable_J_oytCmrNIGz9kmbgY5zMA_a0Rjt17L';
  const pv = crypto.randomUUID();
  const sections = new Set(['top', 'inputs', 'brief', 'references', 'notes', 'naming', 'identity',
    'packaging', 'presentations', 'handoff', 'log', 'files', 'outstanding']);
  const device = innerWidth < 640 ? 'phone' : innerWidth < 1024 ? 'tablet' : 'desktop';
  let sent = 0;

  function sectionOf(element) {
    const section = element?.closest('section[id]')?.id;
    return sections.has(section) ? section : 'top';
  }
  function itemOf(element) {
    const record = element?.closest('.record');
    if (record?.dataset.metric) return record.dataset.metric;
    if (record && /^[A-Z]{3,4}-[0-9]{3}$/.test(record.id)) return record.id;
    return null;
  }
  function routeSection() {
    const id = location.hash.slice(1);
    return sections.has(id) ? id : sectionOf(document.getElementById(id));
  }
  function externalHost() {
    if (!document.referrer) return null;
    try {
      const host = new URL(document.referrer).hostname.toLowerCase();
      return host !== location.hostname && /^[a-z0-9.-]{1,253}$/.test(host) ? host : null;
    } catch { return null; }
  }
  function count(event, section, item = null, ref = null) {
    if (sent >= 150) return;
    sent += 1;
    fetch(endpoint, {
      method: 'POST', keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { apikey: publicKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ pv, event, section, item, device, ref })
    }).catch(() => {});
  }

  let current = routeSection();
  count('view', current, null, externalHost());
  addEventListener('hashchange', () => {
    const next = routeSection();
    if (next !== current) { current = next; count('section', next); }
  });

  document.addEventListener('click', event => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const summary = event.target.closest('summary');
    if (summary && !summary.parentElement.open) {
      const item = itemOf(summary) || (summary.closest('#files') ? 'folders' : 'kickoff-requests');
      count('expand', sectionOf(summary), item);
      return;
    }
    const a = event.target.closest('a[href]');
    if (!a || a.hash && a.origin === location.origin && a.pathname === location.pathname) return;
    const item = itemOf(a) || (a.closest('aside') ? 'repository' : 'section-link');
    count('link', sectionOf(a), item);
  });
})();
