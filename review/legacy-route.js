// Old bookmarks converge on the normal boards URL. Discard obsolete access fragments.
location.replace(new URL('../boards/',location.href).href);
