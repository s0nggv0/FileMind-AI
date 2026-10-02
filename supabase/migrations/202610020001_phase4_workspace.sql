-- Phase 4: no vectors, chunks, OAuth or background jobs.
create table public.profiles (id uuid primary key, created_at timestamptz not null default now());
create table public.workspaces (
  id uuid primary key, user_id uuid not null references public.profiles(id), name text not null,
  status text not null default 'draft' check (status in ('draft','processing','review','completed')),
  revision integer not null default 0, snapshot jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_opened_at timestamptz,
  unique (id,user_id)
);
create table public.documents (
  id uuid primary key, user_id uuid not null, workspace_id uuid not null,
  original_name text not null, display_name text not null, mime_type text not null, file_type text not null,
  file_size bigint not null check(file_size between 0 and 20971520), storage_path text,
  parse_status text not null, processing_status text not null default 'queued',
  text_content text not null default '' check(length(text_content) <= 250000), content_preview text,
  summary text, category text, suggested_filename text, content_hash text, normalized_text_hash text, analysis_cache_key text, analysis_json jsonb,
  metadata jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,user_id,workspace_id), foreign key(workspace_id,user_id) references public.workspaces(id,user_id) on delete cascade
);
create table public.agent_runs (
  id uuid primary key, user_id uuid not null, workspace_id uuid not null, engine text not null check(engine in ('mock','llm')),
  model text, prompt_version text, status text not null check(status in ('planning','running','waiting_for_review','applying','completed','failed','cancelled')),
  started_at timestamptz, completed_at timestamptz, error_code text, error_message text,
  prompt_tokens integer, completion_tokens integer, total_tokens integer, run_json jsonb not null,
  created_at timestamptz not null default now(), unique(id,user_id,workspace_id),
  foreign key(workspace_id,user_id) references public.workspaces(id,user_id) on delete cascade
);
create table public.agent_steps (
  id uuid primary key, user_id uuid not null, workspace_id uuid not null, run_id uuid not null,
  position integer not null, tool_name text not null, status text not null, input jsonb, output jsonb,
  started_at timestamptz, completed_at timestamptz, error_message text,
  foreign key(run_id,user_id,workspace_id) references public.agent_runs(id,user_id,workspace_id) on delete cascade
);
create table public.organization_proposals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, run_id uuid not null, workspace_id uuid not null,
  status text not null check(status in ('draft','reviewing','accepted','partially_accepted','rejected','applied')),
  proposal_json jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(run_id), foreign key(run_id,user_id,workspace_id) references public.agent_runs(id,user_id,workspace_id) on delete cascade
);
create table public.document_tags (
  user_id uuid not null, workspace_id uuid not null, document_id uuid not null, tag text not null check(length(tag) between 1 and 40),
  primary key(document_id,tag), foreign key(document_id,user_id,workspace_id) references public.documents(id,user_id,workspace_id) on delete cascade
);
create table public.document_relations (
  id text primary key, user_id uuid not null, workspace_id uuid not null, source_id uuid not null, target_id uuid not null,
  kind text not null check(kind in ('rule-based','ai-inferred')), reason text not null,
  foreign key(source_id,user_id,workspace_id) references public.documents(id,user_id,workspace_id) on delete cascade,
  foreign key(target_id,user_id,workspace_id) references public.documents(id,user_id,workspace_id) on delete cascade
);
create index on public.workspaces(user_id,updated_at desc);
create index on public.documents(user_id,workspace_id);
create index on public.agent_runs(user_id,workspace_id,created_at desc);
-- Demo identities are server-issued. Browser has no direct database access.
-- Policies also permit a later Auth identity without removing tenant boundaries.
do $$ declare tbl text; begin
  foreach tbl in array array['profiles','workspaces','documents','agent_runs','agent_steps','organization_proposals','document_tags','document_relations'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('create policy owner_access on public.%I for all to authenticated using (auth.uid() = %I) with check (auth.uid() = %I)',tbl,case when tbl='profiles' then 'id' else 'user_id' end,case when tbl='profiles' then 'id' else 'user_id' end);
  end loop;
end $$;

-- One transaction, optimistic concurrency; only the server service role can invoke it.
create function public.save_workspace(p_user uuid, p_snapshot jsonb, p_expected integer) returns integer
language plpgsql security invoker set search_path = public as $$
declare wid uuid := (p_snapshot->>'id')::uuid; current_revision integer; d jsonb; r jsonb := p_snapshot->'run'; s jsonb; proposal jsonb := p_snapshot->'proposal'; pd jsonb; tag text; pos integer := 0;
begin
  select revision into current_revision from workspaces where id=wid and user_id=p_user for update;
  if not found then raise exception 'workspace_not_found'; end if;
  if current_revision <> p_expected then raise exception 'revision_conflict'; end if;
  update workspaces set name=p_snapshot->>'name', revision=current_revision+1, updated_at=now(),
    status=case r->>'status' when 'completed' then 'completed' when 'waiting_for_review' then 'review' when 'planning' then 'processing' when 'running' then 'processing' else 'draft' end,
    snapshot=jsonb_set(p_snapshot - 'texts','{revision}',to_jsonb(current_revision+1)) where id=wid and user_id=p_user;
  for d in select value from jsonb_array_elements(p_snapshot->'documents') loop
    if exists(select 1 from documents where id=(d->>'id')::uuid and (user_id<>p_user or workspace_id<>wid)) then raise exception 'document_not_owned'; end if;
    insert into documents(id,user_id,workspace_id,original_name,display_name,mime_type,file_type,file_size,storage_path,parse_status,text_content,content_preview,content_hash,normalized_text_hash,metadata)
    values((d->>'id')::uuid,p_user,wid,d->>'name',d->>'name',d->>'mimeType',d->>'type',(d->>'size')::bigint,d->>'storagePath',d->>'parseStatus',coalesce(p_snapshot->'texts'->>(d->>'id'),''),left(coalesce(p_snapshot->'texts'->>(d->>'id'),''),500),d->>'contentHash',d->>'normalizedTextHash',d->'metadata')
    on conflict(id) do update set parse_status=excluded.parse_status,text_content=excluded.text_content,content_preview=excluded.content_preview,storage_path=coalesce(excluded.storage_path,documents.storage_path),content_hash=excluded.content_hash,normalized_text_hash=excluded.normalized_text_hash,metadata=excluded.metadata,updated_at=now();
  end loop;
  if r is not null and r <> 'null'::jsonb then
    if exists(select 1 from agent_runs where id=(r->>'id')::uuid and (user_id<>p_user or workspace_id<>wid)) then raise exception 'run_not_owned'; end if;
    insert into agent_runs(id,user_id,workspace_id,engine,model,prompt_version,status,started_at,completed_at,error_message,prompt_tokens,completion_tokens,total_tokens,run_json)
    values((r->>'id')::uuid,p_user,wid,coalesce(r->>'engine','mock'),r->>'model',r->>'promptVersion',r->>'status',to_timestamp((r->>'startedAt')::double precision/1000),to_timestamp((r->>'completedAt')::double precision/1000),r->>'error',(r->'usage'->>'promptTokens')::integer,(r->'usage'->>'completionTokens')::integer,(r->'usage'->>'totalTokens')::integer,r)
    on conflict(id) do update set status=excluded.status,completed_at=excluded.completed_at,error_message=excluded.error_message,prompt_tokens=excluded.prompt_tokens,completion_tokens=excluded.completion_tokens,total_tokens=excluded.total_tokens,run_json=excluded.run_json;
    for s in select value from jsonb_array_elements(r->'steps') loop
      if exists(select 1 from agent_steps where id=(s->>'id')::uuid and (user_id<>p_user or workspace_id<>wid or run_id<>(r->>'id')::uuid)) then raise exception 'step_not_owned'; end if;
      insert into agent_steps(id,user_id,workspace_id,run_id,position,tool_name,status,input,output,started_at,completed_at,error_message)
      values((s->>'id')::uuid,p_user,wid,(r->>'id')::uuid,pos,s->>'tool',s->>'status',s->'input',s->'output',to_timestamp((s->>'startedAt')::double precision/1000),to_timestamp((s->>'completedAt')::double precision/1000),s->>'error')
      on conflict(id) do update set status=excluded.status,output=excluded.output,completed_at=excluded.completed_at,error_message=excluded.error_message;
      pos := pos+1;
    end loop;
    if proposal is not null and proposal <> 'null'::jsonb then
      insert into organization_proposals(user_id,run_id,workspace_id,status,proposal_json) values(p_user,(r->>'id')::uuid,wid,case when r->>'status'='completed' then 'applied' else 'reviewing' end,proposal)
      on conflict(run_id) do update set status=excluded.status,proposal_json=excluded.proposal_json,updated_at=now();
      if r->>'status'='completed' then
        delete from document_tags where workspace_id=wid and user_id=p_user;
        delete from document_relations where workspace_id=wid and user_id=p_user;
        for pd in select value from jsonb_array_elements(proposal->'documents') loop
          update documents set display_name=pd->>'name',summary=pd->>'summary',category=pd->>'category',suggested_filename=pd->>'suggestedName',processing_status='completed',updated_at=now() where id=(pd->>'id')::uuid and user_id=p_user and workspace_id=wid;
          for tag in select jsonb_array_elements_text(pd->'tags') loop
            insert into document_tags values(p_user,wid,(pd->>'id')::uuid,tag) on conflict do nothing;
          end loop;
        end loop;
        for pd in select value from jsonb_array_elements(proposal->'relationships') loop
          if pd->>'decision' <> 'ignored' then
            insert into document_relations values(wid::text||':'||(pd->>'id'),p_user,wid,(pd->>'source')::uuid,(pd->>'target')::uuid,coalesce(pd->>'kind','rule-based'),pd->>'reason');
          end if;
        end loop;
      end if;
    end if;
  end if;
  return current_revision+1;
end $$;
revoke all on function public.save_workspace(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_workspace(uuid,jsonb,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documents','documents',false,20971520,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown','text/x-markdown','image/png','image/jpeg']) on conflict(id) do nothing;
-- No public bucket/object policy. Upload uses a short-lived server-issued token.
