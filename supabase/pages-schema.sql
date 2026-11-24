-- Editable NakedPak pages (nkdpk-pages Edge Function). Isolated from nkdpk_boards_*;
-- editor sessions and uploaded assets are shared with the visual boards.
create table public.nkdpk_pages_state (
 slug text primary key check (slug ~ '^[a-z0-9-]{1,60}$'),
 draft jsonb not null, published jsonb not null,
 revision integer not null default 1, published_revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create table public.nkdpk_pages_history (
 slug text not null references public.nkdpk_pages_state(slug) on delete cascade,
 revision integer not null, document jsonb not null, published boolean not null,
 created_at timestamptz not null default now(), primary key (slug, revision)
);
alter table public.nkdpk_pages_state enable row level security;
alter table public.nkdpk_pages_history enable row level security;
revoke all on public.nkdpk_pages_state, public.nkdpk_pages_history from anon, authenticated;
grant all on public.nkdpk_pages_state, public.nkdpk_pages_history to service_role;
create function public.nkdpk_pages_save(p_slug text, p_revision integer, p_document jsonb, p_publish boolean default false) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare current_state public.nkdpk_pages_state; next_revision integer;
begin
 select * into current_state from public.nkdpk_pages_state where slug = p_slug for update;
 if not found then raise exception 'Unknown page'; end if;
 if current_state.revision <> p_revision then return jsonb_build_object('conflict', true, 'revision', current_state.revision); end if;
 if jsonb_typeof(p_document->'territories') <> 'array' or p_document->>'version' <> '1' or octet_length(p_document::text) > 1048576 then raise exception 'Invalid page document'; end if;
 next_revision := current_state.revision + 1;
 update public.nkdpk_pages_state set draft = p_document, revision = next_revision, updated_at = now(),
  published = case when p_publish then p_document else published end,
  published_revision = case when p_publish then next_revision else published_revision end
 where slug = p_slug;
 insert into public.nkdpk_pages_history(slug, revision, document, published) values (p_slug, next_revision, p_document, p_publish);
 if p_publish then
  update public.nkdpk_boards_assets set published = true
  where id::text in (select value #>> '{}' from jsonb_path_query(p_document, 'strict $.**.assetId') as value);
 end if;
 delete from public.nkdpk_pages_history where slug = p_slug and revision < next_revision - 199;
 return jsonb_build_object('revision', next_revision, 'publishedRevision', case when p_publish then next_revision else current_state.published_revision end);
end $$;
revoke all on function public.nkdpk_pages_save(text, integer, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.nkdpk_pages_save(text, integer, jsonb, boolean) to service_role;
