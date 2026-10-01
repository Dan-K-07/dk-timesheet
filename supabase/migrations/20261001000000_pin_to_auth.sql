-- =====================================================================
-- DK Timesheet: move from PIN-based access to Supabase Auth
-- =====================================================================
-- What this does, all in one transaction (if anything fails, nothing
-- changes):
--   1. Adds a user_id column to timesheet_sync and timesheet_documents.
--   2. Moves your existing PIN row (and its documents) to your account.
--   3. Removes every existing policy on those two tables (the old
--      anon/PIN ones) and replaces them with "signed-in users can only
--      see and change their own rows" policies.
--   4. Replaces the anon policies on the "documents" storage bucket the
--      same way.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole
--   file -> change the two values in the "EDIT THESE" block below ->
--   Run. Don't commit your edited copy back to the repo: it's public.
--
-- Run it right before merging the matching app change. The old PIN app
-- stops working as soon as this runs.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- EDIT THESE two values (keep the quotes)
-- ---------------------------------------------------------------------
create temporary table _migration_input on commit drop as
select
  'REPLACE_WITH_YOUR_LOGIN_EMAIL'::text as login_email,  -- the email you sign in with
  'REPLACE_WITH_YOUR_OLD_PIN'::text     as old_pin;      -- the PIN you use today

-- ---------------------------------------------------------------------
-- 0. Safety checks
-- ---------------------------------------------------------------------
do $$
declare
  v_email text;
  v_pin   text;
begin
  select login_email, old_pin into v_email, v_pin from _migration_input;
  if v_email like 'REPLACE_WITH_%' or v_pin like 'REPLACE_WITH_%' then
    raise exception 'Edit login_email and old_pin near the top of this script before running it.';
  end if;
  if not exists (select 1 from auth.users where lower(email) = lower(v_email)) then
    raise exception 'No Supabase Auth user has the email %. Check Authentication -> Users.', v_email;
  end if;
  if not exists (select 1 from public.timesheet_sync where pin = v_pin) then
    raise exception 'No timesheet_sync row has that PIN. Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
-- Old foreign keys between the two tables via pin would block step 2,
-- and pin is no longer what links rows to an owner.
do $$
declare r record;
begin
  for r in
    select conname, conrelid::regclass as tbl
    from pg_constraint
    where contype = 'f'
      and conrelid in ('public.timesheet_sync'::regclass, 'public.timesheet_documents'::regclass)
      and confrelid in ('public.timesheet_sync'::regclass, 'public.timesheet_documents'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    raise notice 'Dropped old foreign key % on %', r.conname, r.tbl;
  end loop;
end $$;

alter table public.timesheet_sync
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.timesheet_sync
  alter column user_id set default auth.uid();
-- pin stays as the table's existing key but is no longer used for access.
-- New rows get the owner's id so it is never blank.
alter table public.timesheet_sync
  alter column pin set default (auth.uid())::text;
create unique index if not exists timesheet_sync_user_id_key
  on public.timesheet_sync (user_id);

alter table public.timesheet_documents
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.timesheet_documents
  alter column user_id set default auth.uid();
alter table public.timesheet_documents
  alter column pin set default (auth.uid())::text;
create index if not exists timesheet_documents_user_id_idx
  on public.timesheet_documents (user_id);

-- ---------------------------------------------------------------------
-- 2. Move your PIN row and documents to your account
-- ---------------------------------------------------------------------
do $$
declare
  v_uid  uuid;
  v_pin  text;
  v_rows int;
begin
  select u.id, i.old_pin into v_uid, v_pin
  from _migration_input i
  join auth.users u on lower(u.email) = lower(i.login_email);

  update public.timesheet_sync
     set user_id = v_uid, pin = v_uid::text
   where pin = v_pin;
  get diagnostics v_rows = row_count;
  raise notice 'Moved % timesheet row(s) to your account', v_rows;

  update public.timesheet_documents
     set user_id = v_uid, pin = v_uid::text
   where pin = v_pin;
  get diagnostics v_rows = row_count;
  raise notice 'Moved % document record(s) to your account', v_rows;
end $$;

-- ---------------------------------------------------------------------
-- 3. Table policies: signed-in owner only
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('timesheet_sync', 'timesheet_documents')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'Dropped old policy "%" on %', r.policyname, r.tablename;
  end loop;
end $$;

alter table public.timesheet_sync enable row level security;
alter table public.timesheet_documents enable row level security;

revoke all on public.timesheet_sync from anon;
revoke all on public.timesheet_documents from anon;
grant select, insert, update, delete on public.timesheet_sync to authenticated;
grant select, insert, update, delete on public.timesheet_documents to authenticated;

create policy "Owner can read timesheet" on public.timesheet_sync
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owner can add timesheet" on public.timesheet_sync
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owner can update timesheet" on public.timesheet_sync
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owner can delete timesheet" on public.timesheet_sync
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Owner can read documents" on public.timesheet_documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owner can add documents" on public.timesheet_documents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owner can update documents" on public.timesheet_documents
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owner can delete documents" on public.timesheet_documents
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 4. Storage policies for the "documents" bucket
-- ---------------------------------------------------------------------
-- New uploads go in a folder named after your user id. Files uploaded
-- before this change live under the old PIN folder, so access to those
-- is granted through the matching timesheet_documents record instead.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') ilike '%''documents''%' or coalesce(with_check, '') ilike '%''documents''%')
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'Dropped old storage policy "%"', r.policyname;
  end loop;
end $$;

-- Anything still open to anonymous users on storage is reported so you
-- can check it by hand (it may belong to another bucket).
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and ('anon' = any (roles) or 'public' = any (roles))
  loop
    raise warning 'Storage policy "%" still allows anonymous access. Check it in Storage -> Policies.', r.policyname;
  end loop;
end $$;

create policy "Owner can upload timesheet documents" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owner can read timesheet documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.timesheet_documents d
        where d.storage_path = storage.objects.name and d.user_id = (select auth.uid())
      )
    )
  );

create policy "Owner can delete timesheet documents" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.timesheet_documents d
        where d.storage_path = storage.objects.name and d.user_id = (select auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------
-- 5. Realtime: make sure both tables still broadcast changes
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No supabase_realtime publication found: turn on Realtime for both tables in Database -> Publications.';
    return;
  end if;
  foreach t in array array['timesheet_sync', 'timesheet_documents'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'Added % to realtime', t;
    end if;
  end loop;
end $$;

commit;

-- =====================================================================
-- Optional clean-up, run separately afterwards if you want:
-- rows created by other PINs (e.g. typos) are now unreachable by the app.
--   delete from public.timesheet_sync where user_id is null;
--   delete from public.timesheet_documents where user_id is null;
-- =====================================================================
