create table filemind.operation_journal (
  id uuid primary key, user_id uuid not null references filemind.profiles(id) on delete cascade,
  operation_type text not null check(operation_type in ('document_upload','workspace_apply','backup_import','reindex','file_delete','storage_repair','demo_reset')),
  resource_id uuid, lock_key text not null check(length(lock_key) between 1 and 160),
  status text not null check(status in ('pending','running','committed','rolled_back','interrupted')),
  stage text not null check(length(stage) between 1 and 60),
  payload jsonb not null default '{}' check(jsonb_typeof(payload)='object'),
  owner_instance uuid not null,
  started_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  completed_at timestamptz, error_code text check(error_code ~ '^[A-Z][A-Z0-9_]{0,59}$'),
  unique(id,user_id)
);
create index on filemind.operation_journal(user_id,status,started_at);
alter table filemind.operation_journal enable row level security;
alter table filemind.operation_journal force row level security;
create policy owner_access on filemind.operation_journal for all
  using (user_id=nullif(current_setting('filemind.user_id',true),'')::uuid)
  with check (user_id=nullif(current_setting('filemind.user_id',true),'')::uuid);

alter table filemind.documents add column storage_status text not null default 'available'
  check(storage_status in ('available','missing','not_stored'));
update filemind.documents set storage_status='not_stored' where storage_path is null;
