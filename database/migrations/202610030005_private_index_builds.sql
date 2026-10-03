-- Online index health is independent of an in-progress replacement build.
alter table filemind.documents
  add column index_build_status text not null default 'idle' check(index_build_status in ('idle','chunking','embedding','ready','failed','interrupted')),
  add column index_build_id uuid,
  add column index_build_error_code text;
