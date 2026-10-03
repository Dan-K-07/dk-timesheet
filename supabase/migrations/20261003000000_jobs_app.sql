-- =====================================================================
-- DK Jobs: tables and storage for the Jobs app (/jobs/)
-- =====================================================================
-- Creates:
--   1. jobs_sync    - one row per user holding the whole Jobs app data
--                     (clients, jobs, price list, quotes, invoices,
--                     business expenses, mileage, settings). Same idea as
--                     timesheet_sync, kept separate so the two apps never
--                     overwrite each other.
--   2. "receipts"   - a private storage bucket for receipt photos/PDFs.
--                     Each user's files live in a folder named after their
--                     user id and nobody else can reach them.
--
-- Safe to run before the matching app update goes live: nothing else
-- uses these yet, and running it twice does no harm.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole
--   file -> make sure the role is "postgres" -> Run. Nothing to edit.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. jobs_sync table
-- ---------------------------------------------------------------------
create table if not exists public.jobs_sync (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

alter table public.jobs_sync enable row level security;

revoke all on public.jobs_sync from anon;
grant select, insert, update, delete on public.jobs_sync to authenticated;

drop policy if exists "Owner can read jobs" on public.jobs_sync;
drop policy if exists "Owner can add jobs" on public.jobs_sync;
drop policy if exists "Owner can update jobs" on public.jobs_sync;
drop policy if exists "Owner can delete jobs" on public.jobs_sync;

create policy "Owner can read jobs" on public.jobs_sync
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owner can add jobs" on public.jobs_sync
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owner can update jobs" on public.jobs_sync
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owner can delete jobs" on public.jobs_sync
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Realtime, so changes show on your other devices straight away.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No supabase_realtime publication found: turn on Realtime for jobs_sync in Database -> Publications.';
  elsif not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jobs_sync'
  ) then
    alter publication supabase_realtime add table public.jobs_sync;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Private "receipts" bucket (10 MB per file, images and PDFs)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Owner can upload receipts" on storage.objects;
drop policy if exists "Owner can read receipts" on storage.objects;
drop policy if exists "Owner can delete receipts" on storage.objects;

create policy "Owner can upload receipts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owner can read receipts" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owner can delete receipts" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
