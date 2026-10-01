-- =====================================================================
-- DK Timesheet: store Settings (date format, day type colours) on the
-- account so they're the same on every device.
-- =====================================================================
-- Adds a settings column to your existing timesheet row. The row's
-- owner-only security policies and realtime already cover it.
--
-- Safe to run before the matching app update goes live: the current app
-- doesn't send this column, so saving leaves it untouched.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole
--   file -> make sure the role is "postgres" -> Run. Nothing to edit.
-- =====================================================================

alter table public.timesheet_sync
  add column if not exists settings jsonb not null default '{}'::jsonb;
