create table filemind.demo_registration (
  user_id uuid primary key references filemind.profiles(id) on delete cascade,
  workspace_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(workspace_id,user_id) references filemind.workspaces(id,user_id) on delete cascade
);
alter table filemind.demo_registration enable row level security;
alter table filemind.demo_registration force row level security;
create policy owner_access on filemind.demo_registration for all
  using(user_id=nullif(current_setting('filemind.user_id',true),'')::uuid)
  with check(user_id=nullif(current_setting('filemind.user_id',true),'')::uuid);
