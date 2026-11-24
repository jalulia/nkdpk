create table public.nkdpk_boards_state (
 id boolean primary key default true check (id),
 draft jsonb not null default '{"version":1,"territories":[]}',
 published jsonb not null default '{"version":1,"territories":[]}',
 revision integer not null default 0, published_revision integer not null default 0,
 updated_at timestamptz not null default now()
);
insert into public.nkdpk_boards_state(id) values(true);
create table public.nkdpk_boards_secrets(id text primary key, key_hash text not null);
create table public.nkdpk_boards_sessions(token_hash text primary key, expires_at timestamptz not null);
create table public.nkdpk_boards_attempts(id text primary key, started_at timestamptz not null, attempts integer not null);
create table public.nkdpk_boards_assets(id uuid primary key, path text not null unique, mime text not null, bytes integer not null, published boolean not null default false, created_at timestamptz not null default now());
create table public.nkdpk_boards_history(revision integer primary key, document jsonb not null, published boolean not null, created_at timestamptz not null default now());
alter table public.nkdpk_boards_state enable row level security;
alter table public.nkdpk_boards_secrets enable row level security;
alter table public.nkdpk_boards_sessions enable row level security;
alter table public.nkdpk_boards_attempts enable row level security;
alter table public.nkdpk_boards_assets enable row level security;
alter table public.nkdpk_boards_history enable row level security;
revoke all on public.nkdpk_boards_state,public.nkdpk_boards_secrets,public.nkdpk_boards_sessions,public.nkdpk_boards_attempts,public.nkdpk_boards_assets,public.nkdpk_boards_history from anon,authenticated;
grant all on public.nkdpk_boards_state,public.nkdpk_boards_secrets,public.nkdpk_boards_sessions,public.nkdpk_boards_attempts,public.nkdpk_boards_assets,public.nkdpk_boards_history to service_role;
create function public.nkdpk_boards_unlock(p_key_hash text,p_fingerprint text,p_token_hash text) returns text
language plpgsql security invoker set search_path=public as $
declare local_attempt public.nkdpk_boards_attempts; stored_hash text;
begin
 if p_fingerprint !~ '^[a-f0-9]{64}
create function public.nkdpk_boards_save(p_revision integer,p_document jsonb,p_publish boolean default false) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare current_state public.nkdpk_boards_state; next_revision integer;
begin
 select * into current_state from public.nkdpk_boards_state where id=true for update;
 if current_state.revision<>p_revision then return jsonb_build_object('conflict',true,'revision',current_state.revision);end if;
 if jsonb_typeof(p_document->'territories')<>'array' or p_document->>'version'<>'1' or octet_length(p_document::text)>1048576 then raise exception 'Invalid board document';end if;
 next_revision:=current_state.revision+1;
 update public.nkdpk_boards_state set draft=p_document, revision=next_revision, updated_at=now(),
 published=case when p_publish then p_document else published end,
 published_revision=case when p_publish then next_revision else published_revision end where id=true;
 insert into public.nkdpk_boards_history(revision,document,published) values(next_revision,p_document,p_publish);
 if p_publish then
 update public.nkdpk_boards_assets set published=true where id::text in
 (select value #>> '{}' from jsonb_path_query(p_document,'$.territories[*].boards[*].images[*].assetId') as value
 union select value #>> '{}' from jsonb_path_query(p_document,'$.territories[*].studies[*].images[*].assetId') as value);
 end if;
 delete from public.nkdpk_boards_history where revision < next_revision-199;
 return jsonb_build_object('revision',next_revision,'publishedRevision',case when p_publish then next_revision else current_state.published_revision end);
end $$;
revoke all on function public.nkdpk_boards_save(integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.nkdpk_boards_save(integer,jsonb,boolean) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nkdpk-boards','nkdpk-boards',false,10485760,array['image/jpeg','image/png','image/webp','image/gif']); or p_token_hash !~ '^[a-f0-9]{64}
create function public.nkdpk_boards_save(p_revision integer,p_document jsonb,p_publish boolean default false) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare current_state public.nkdpk_boards_state; next_revision integer;
begin
 select * into current_state from public.nkdpk_boards_state where id=true for update;
 if current_state.revision<>p_revision then return jsonb_build_object('conflict',true,'revision',current_state.revision);end if;
 if jsonb_typeof(p_document->'territories')<>'array' or p_document->>'version'<>'1' or octet_length(p_document::text)>1048576 then raise exception 'Invalid board document';end if;
 next_revision:=current_state.revision+1;
 update public.nkdpk_boards_state set draft=p_document, revision=next_revision, updated_at=now(),
 published=case when p_publish then p_document else published end,
 published_revision=case when p_publish then next_revision else published_revision end where id=true;
 insert into public.nkdpk_boards_history(revision,document,published) values(next_revision,p_document,p_publish);
 if p_publish then
 update public.nkdpk_boards_assets set published=true where id::text in
 (select value #>> '{}' from jsonb_path_query(p_document,'$.territories[*].boards[*].images[*].assetId') as value
 union select value #>> '{}' from jsonb_path_query(p_document,'$.territories[*].studies[*].images[*].assetId') as value);
 end if;
 delete from public.nkdpk_boards_history where revision < next_revision-199;
 return jsonb_build_object('revision',next_revision,'publishedRevision',case when p_publish then next_revision else current_state.published_revision end);
end $$;
revoke all on function public.nkdpk_boards_save(integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.nkdpk_boards_save(integer,jsonb,boolean) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nkdpk-boards','nkdpk-boards',false,10485760,array['image/jpeg','image/png','image/webp','image/gif']); or p_key_hash !~ '^[a-f0-9]{64}
create function public.nkdpk_boards_save(p_revision integer,p_document jsonb,p_publish boolean default false) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare current_state public.nkdpk_boards_state; next_revision integer;
begin
 select * into current_state from public.nkdpk_boards_state where id=true for update;
 if current_state.revision<>p_revision then return jsonb_build_object('conflict',true,'revision',current_state.revision);end if;
 if jsonb_typeof(p_document->'territories')<>'array' or p_document->>'version'<>'1' or octet_length(p_document::text)>1048576 then raise exception 'Invalid board document';end if;
 next_revision:=current_state.revision+1;
 update public.nkdpk_boards_state set draft=p_document, revision=next_revision, updated_at=now(),
 published=case when p_publish then p_document else published end,
 published_revision=case when p_publish then next_revision else published_revision end where id=true;
 insert into public.nkdpk_boards_history(revision,document,published) values(next_revision,p_document,p_publish);
 if p_publish then
 update public.nkdpk_boards_assets set published=true where id::text in
 (select value #>> '{}' from jsonb_path_query(p_document,'$.territories[*].boards[*].images[*].assetId') as value
 union select value #>> '{}' from jsonb_path_query(p_document,'$.territories[*].studies[*].images[*].assetId') as value);
 end if;
 delete from public.nkdpk_boards_history where revision < next_revision-199;
 return jsonb_build_object('revision',next_revision,'publishedRevision',case when p_publish then next_revision else current_state.published_revision end);
end $$;
revoke all on function public.nkdpk_boards_save(integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.nkdpk_boards_save(integer,jsonb,boolean) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nkdpk-boards','nkdpk-boards',false,10485760,array['image/jpeg','image/png','image/webp','image/gif']); then return 'invalid';end if;
 insert into public.nkdpk_boards_attempts values(p_fingerprint,now(),0) on conflict do nothing;
 select * into local_attempt from public.nkdpk_boards_attempts where id=p_fingerprint for update;
 if local_attempt.started_at<now()-interval '5 minutes' then update public.nkdpk_boards_attempts set started_at=now(),attempts=0 where id=p_fingerprint;local_attempt.attempts:=0;end if;
 if local_attempt.attempts>=6 then return 'rate_limited';end if;
 select key_hash into stored_hash from public.nkdpk_boards_secrets where id='editor';
 if stored_hash is null or p_key_hash<>stored_hash then update public.nkdpk_boards_attempts set attempts=attempts+1 where id=p_fingerprint;return 'invalid';end if;
 update public.nkdpk_boards_attempts set attempts=0 where id=p_fingerprint;
 delete from public.nkdpk_boards_sessions where expires_at<now();
 insert into public.nkdpk_boards_sessions values(p_token_hash,now()+interval '12 hours');
 return 'ok';
end $;
revoke all on function public.nkdpk_boards_unlock(text,text,text) from public,anon,authenticated;
grant execute on function public.nkdpk_boards_unlock(text,text,text) to service_role;
create function public.nkdpk_boards_save(p_revision integer,p_document jsonb,p_publish boolean default false) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare current_state public.nkdpk_boards_state; next_revision integer;
begin
 select * into current_state from public.nkdpk_boards_state where id=true for update;
 if current_state.revision<>p_revision then return jsonb_build_object('conflict',true,'revision',current_state.revision);end if;
 if jsonb_typeof(p_document->'territories')<>'array' or p_document->>'version'<>'1' or octet_length(p_document::text)>1048576 then raise exception 'Invalid board document';end if;
 next_revision:=current_state.revision+1;
 update public.nkdpk_boards_state set draft=p_document, revision=next_revision, updated_at=now(),
 published=case when p_publish then p_document else published end,
 published_revision=case when p_publish then next_revision else published_revision end where id=true;
 insert into public.nkdpk_boards_history(revision,document,published) values(next_revision,p_document,p_publish);
 if p_publish then
 update public.nkdpk_boards_assets set published=true where id::text in
 (select value #>> '{}' from jsonb_path_query(p_document,'$.territories[*].boards[*].images[*].assetId') as value
 union select value #>> '{}' from jsonb_path_query(p_document,'$.territories[*].studies[*].images[*].assetId') as value);
 end if;
 delete from public.nkdpk_boards_history where revision < next_revision-199;
 return jsonb_build_object('revision',next_revision,'publishedRevision',case when p_publish then next_revision else current_state.published_revision end);
end $$;
revoke all on function public.nkdpk_boards_save(integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.nkdpk_boards_save(integer,jsonb,boolean) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nkdpk-boards','nkdpk-boards',false,10485760,array['image/jpeg','image/png','image/webp','image/gif']);
