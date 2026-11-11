-- FORCE RLS can hide existing rows during migration; read APIs normalize legacy
-- NULL paths and tenant reconciliation backfills them. Future writes stay honest.
create function filemind.storage_health_on_write() returns trigger language plpgsql as $$
begin
  if new.storage_path is null then new.storage_status := 'not_stored';
  elsif tg_op = 'INSERT' then new.storage_status := 'available';
  elsif new.storage_path is distinct from old.storage_path then new.storage_status := 'available';
  end if;
  return new;
end;
$$;
create trigger storage_health_on_write before insert or update of storage_path
  on filemind.documents for each row execute function filemind.storage_health_on_write();
