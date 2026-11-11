alter table filemind.documents
  add column content_source text not null default 'text' check(content_source in ('text','image','scan','mixed')),
  add column image_width integer,
  add column image_height integer,
  add column vision_status text not null default 'disabled',
  add column ocr_status text not null default 'disabled',
  add column vision_model text,
  add column ocr_engine text;
update filemind.documents set content_source='image' where file_type='image';
alter table filemind.document_chunks add column chunk_source text not null default 'text' check(chunk_source in ('text','ocr','vision_summary','concepts','mixed'));
create table filemind.multimodal_analysis (
  document_id uuid primary key, user_id uuid not null, workspace_id uuid not null,
  image_type text, ocr_text text not null default '', vision_summary text not null default '',
  topics text[] not null default '{}', tags text[] not null default '{}', visible_concepts text[] not null default '{}',
  confidence real not null check(confidence between 0 and 1), provider text not null, model text not null, analysis_version text not null,
  analysis jsonb not null, created_at timestamptz not null default now(),
  foreign key(document_id,user_id,workspace_id) references filemind.documents(id,user_id,workspace_id) on delete cascade
);
alter table filemind.multimodal_analysis enable row level security;
alter table filemind.multimodal_analysis force row level security;
create policy owner_access on filemind.multimodal_analysis for all using(user_id=nullif(current_setting('filemind.user_id',true),'')::uuid) with check(user_id=nullif(current_setting('filemind.user_id',true),'')::uuid);
create function filemind.update_image_metadata() returns trigger language plpgsql as $$
begin
  new.content_source := case when new.file_type='image' then 'image' else 'text' end;
  new.image_width := (new.metadata->>'width')::integer;
  new.image_height := (new.metadata->>'height')::integer;
  return new;
end $$;
create trigger image_metadata before insert or update of metadata,file_type on filemind.documents for each row execute function filemind.update_image_metadata();
