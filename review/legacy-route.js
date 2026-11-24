// Preserve existing study links while making the PIN gallery the default.
(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  if (['code', 'error', 'error_code', 'error_description', 'access_token', 'refresh_token'].some(key => query.has(key))) return;
  const fragment = new URLSearchParams(location.hash.slice(1));
  const view = /^(project|ledger|inputs|sources(?:\/[\w-]+)?|reference\/[\w-]+|(?:board|sample|pin)\/[1-9]\d{0,2})$/;
  const key = fragment.get('k');
  const open = query.get('open');
  const keylessBoard = /^board\/[1-9]\d{0,2}$/.test(open || '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(key || '') && (!view.test(open || '') || keylessBoard)) return;
  const dest = new URL('./legacy.html', location.href);
  if (view.test(open || '')) dest.searchParams.set('open', open);
  if (/^[A-Za-z0-9_-]{43}$/.test(key || '')) {
    const kept = new URLSearchParams({ k: key });
    if (view.test(fragment.get('v') || '')) kept.set('v', fragment.get('v'));
    dest.hash = kept.toString();
  }
  location.replace(dest.href);
})();
