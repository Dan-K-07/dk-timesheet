# DK Timesheet & DK Jobs

Hosting: see docs/self-hosting.md

## Workflow (agreed with Dan)
- When a change is finished, Claude opens the pull request **and merges it into `main` itself**. No need to ask first.
- Before merging: both builds must pass, `TIMESHEETS_URL=https://timesheets.dkevent.co.uk JOBS_URL=https://jobs.dkevent.co.uk npm run build:timesheets` and the same with `build:jobs`, and the changed pages must load with no errors.
- Merging to `main` redeploys both live sites (Coolify) and the Netlify standby, so don't merge anything half-done or untested. Bump `APP_VERSION` (js/config.js) / `JOBS_VERSION` (jobs/js/core.js) for app changes.
- Still ask first for anything risky: deleting data, database migrations, changing login, or anything that can't be undone.
