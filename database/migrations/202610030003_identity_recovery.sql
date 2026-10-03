-- Credential tables are a server-only authentication surface, not tenant data.
-- A lookup must work before the request has a tenant identity. No PUBLIC grants.
create table filemind.recovery_credentials (
  user_id uuid primary key references filemind.profiles(id) on delete cascade,
  key_digest text not null unique check(key_digest ~ '^[a-f0-9]{64}$'),
  configured_at timestamptz not null default now()
);
create table filemind.recovery_attempts (
  bucket text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
revoke all on filemind.recovery_credentials,filemind.recovery_attempts from public;

-- Serialize increments in PostgreSQL, including across processes/restarts.
create function filemind.recovery_attempt(p_bucket text) returns boolean
language plpgsql security definer set search_path=filemind,pg_temp as $$
declare n integer;
begin
  insert into recovery_attempts(bucket,window_start,attempts) values(p_bucket,clock_timestamp(),1)
  on conflict(bucket) do update set
    attempts=case when recovery_attempts.window_start < clock_timestamp()-interval '15 minutes' then 1 else recovery_attempts.attempts+1 end,
    window_start=case when recovery_attempts.window_start < clock_timestamp()-interval '15 minutes' then clock_timestamp() else recovery_attempts.window_start end
  returning attempts into n;
  return n <= 10;
end $$;
revoke all on function filemind.recovery_attempt(text) from public;

alter table filemind.profiles add column last_backup_at timestamptz;
