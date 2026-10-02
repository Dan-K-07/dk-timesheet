-- =====================================================================
-- DK Timesheet: Expenses
-- =====================================================================
-- Creates the expenses table used by the Expenses tab. Each signed-in
-- user can only see and change their own rows.
--
-- Safe to run before the matching app update goes live: the current app
-- doesn't use this table.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole
--   file -> make sure the role is "postgres" -> Run. Nothing to edit.
-- =====================================================================

begin;

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  -- Free text so the category list can be edited in Settings.
  category     text not null default 'Other',
  amount       numeric(12, 2) not null check (amount >= 0),
  frequency    text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly', 'one-off')),
  -- First payment (for one-off: the date it's paid).
  start_date   date not null default current_date,
  end_date     date check (end_date is null or end_date >= start_date),
  -- Day of the month it's paid (monthly/quarterly/yearly). Empty = same
  -- day of the month as start_date.
  payment_day  smallint check (payment_day between 1 and 31),
  notes        text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists expenses_user_id_idx on public.expenses (user_id);

alter table public.expenses enable row level security;

revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;

drop policy if exists "Owner can read expenses" on public.expenses;
drop policy if exists "Owner can add expenses" on public.expenses;
drop policy if exists "Owner can update expenses" on public.expenses;
drop policy if exists "Owner can delete expenses" on public.expenses;

create policy "Owner can read expenses" on public.expenses
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owner can add expenses" on public.expenses
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owner can update expenses" on public.expenses
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owner can delete expenses" on public.expenses
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Realtime, so changes show on your other devices straight away.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No supabase_realtime publication found: turn on Realtime for expenses in Database -> Publications.';
  elsif not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
end $$;

commit;
