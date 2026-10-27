-- =====================================================================
-- DK Timesheet: remember WHEN an expense was paused
-- =====================================================================
-- Adds a "paused_periods" list to each expense, e.g.
--   [{"from": "2026-10-27", "to": null}]
-- so pausing only stops payments from that day on. Payments that had
-- already gone out (this month's list, the year view) are kept, and if
-- you resume later the months it was paused stay unpaid.
--
-- Safe to run more than once, and safe to run before the app update
-- goes live (the current app just ignores the new column).
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole
--   file -> make sure the role is "postgres" -> Run. Nothing to edit.
-- =====================================================================

begin;

alter table public.expenses
  add column if not exists paused_periods jsonb not null default '[]'::jsonb;

-- Expenses that are already paused are left alone: we don't know when
-- they were paused, so the app keeps treating them as paused throughout,
-- exactly as before. Only pauses from now on get a date.

commit;
