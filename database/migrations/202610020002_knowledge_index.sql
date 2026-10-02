alter table filemind.documents
  add column index_status text not null default 'not_indexed' check(index_status in ('not_indexed','chunking','embedding','ready','failed','stale')),
  add column indexed_at timestamptz,
  add column embedding_model text,
  add column embedding_provider text,
  add column chunk_version text,
  add column index_generation uuid,
  add column index_error_code text;

create table filemind.document_chunks (
  id uuid primary key, user_id uuid not null, workspace_id uuid not null, document_id uuid not null,
  chunk_index integer not null check(chunk_index >= 0), content text not null, content_hash text not null,
  page_start integer, page_end integer, line_start integer, line_end integer,
  paragraph_start integer, paragraph_end integer, heading_path text[] not null default '{}',
  char_start integer not null, char_end integer not null, token_estimate integer not null,
  chunk_version text not null, lexical_tokens text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,user_id,workspace_id,document_id), unique(document_id,chunk_index),
  foreign key(document_id,user_id,workspace_id) references filemind.documents(id,user_id,workspace_id) on delete cascade,
  check(char_start >= 0 and char_end > char_start)
);
create table filemind.chunk_embeddings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, workspace_id uuid not null, document_id uuid not null, chunk_id uuid not null,
  provider text not null, model text not null, dimensions integer not null check(dimensions > 0),
  embedding real[] not null, embedding_hash text not null, chunk_version text not null,
  created_at timestamptz not null default now(),
  unique(chunk_id,provider,model,chunk_version), check(cardinality(embedding) = dimensions),
  foreign key(chunk_id,user_id,workspace_id,document_id) references filemind.document_chunks(id,user_id,workspace_id,document_id) on delete cascade
);
create table filemind.retrieval_runs (
  id uuid primary key, user_id uuid not null references filemind.profiles(id), workspace_id uuid,
  query text not null, rewritten_query text, mode text not null check(mode in ('ask','find')),
  vector_model text, vector_provider text, top_k integer not null,
  retrieved_chunk_ids uuid[] not null, evidence_ids uuid[] not null,
  reranker_status text not null, latency jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(workspace_id,user_id) references filemind.workspaces(id,user_id) on delete cascade
);
create index on filemind.document_chunks(user_id,workspace_id,document_id);
create index on filemind.document_chunks using gin(lexical_tokens);
create index on filemind.chunk_embeddings(user_id,provider,model,chunk_version);
create index on filemind.retrieval_runs(user_id,created_at desc);
do $$ declare tbl text; begin
  foreach tbl in array array['document_chunks','chunk_embeddings','retrieval_runs'] loop
    execute format('alter table filemind.%I enable row level security',tbl);
    execute format('alter table filemind.%I force row level security',tbl);
    execute format('create policy owner_access on filemind.%I for all using (user_id = nullif(current_setting(''filemind.user_id'',true),'''')::uuid) with check (user_id = nullif(current_setting(''filemind.user_id'',true),'''')::uuid)',tbl);
  end loop;
end $$;

-- Reindexing invalidates old retrieval immediately. FK cascades remove vectors.
create function filemind.invalidate_knowledge_index() returns trigger
language plpgsql security invoker set search_path=filemind,pg_temp as $$
begin
  if old.text_content is distinct from new.text_content or old.metadata is distinct from new.metadata then
    delete from document_chunks where document_id=new.id and user_id=new.user_id;
    delete from retrieval_runs where user_id=new.user_id and (new.id::text in (select value->>'documentId' from jsonb_array_elements(coalesce(result->'sources','[]'::jsonb))));
    new.index_status := 'stale'; new.indexed_at := null; new.index_generation := null;
  end if;
  return new;
end $$;
create trigger document_index_invalidation before update of text_content,metadata on filemind.documents
  for each row execute function filemind.invalidate_knowledge_index();
