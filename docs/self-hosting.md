# Self-hosting (NUC + Coolify + Cloudflare Tunnel)

Same setup as Sky Spark: same NUC, same Coolify, same `nuc-server` tunnel.

## The two sites
| Site | URL | Coolify build command | Contents |
|---|---|---|---|
| Timesheets | `https://timesheets.dkevent.co.uk` | `npm run build:timesheets` | `index.html`, `js/`, `css/` |
| Jobs | `https://jobs.dkevent.co.uk` | `npm run build:jobs` | `jobs/` + `css/styles.css`, `css/theme.css` |

- Both are static sites with no build dependencies. `scripts/build.mjs` copies the right files into `dist/` and writes `js/site-config.js` with the two URLs.
- Both use the same hosted Supabase project (unchanged). The Supabase URL and publishable key are in `js/config.js` and `jobs/js/core.js`. They're public by design. **Never** add a service role key.
- Links use `#/...`, so deep links can't 404 and no SPA fallback is needed.
- Old combined-site links: `/jobs/...` on either site redirects to the jobs home page (keeping the `#...` part).
- Logins are separate per site (browser storage is per subdomain). Password reset is on the timesheet site; the jobs login page links there.

## Coolify (project "Timesheets & Jobs", environment "production", two resources)
Dashboard: `http://192.168.0.196:8000` on the LAN (live updates don't work through the public Coolify address; harmless).

For each resource: GitHub App **skyspark-github** (the same app as Sky Spark, it can see this repo), repo `Dan-K-07/dk-timesheet`, branch `main`. Build pack **Nixpacks**, output type **Static site**, publish directory `/dist`, base directory `/`. Coolify warns that Nixpacks is deprecated; it still works. Moving to Railpack is a later job.

Resource names: `timesheets` and `jobs`. Both show "Running (no healthcheck)", which is normal for a static site. A push to `main` redeploys both.

| Setting | Timesheets | Jobs |
|---|---|---|
| Build command | `npm run build:timesheets` | `npm run build:jobs` |
| Domain | `http://timesheets.dkevent.co.uk` | `http://jobs.dkevent.co.uk` |

Env vars on **both** (tick "Build variable"):
- `TIMESHEETS_URL=https://timesheets.dkevent.co.uk`
- `JOBS_URL=https://jobs.dkevent.co.uk`

Jobs resource only (optional, for Google Calendar sync; tick "Build variable"):
- `GOOGLE_CLIENT_ID=<OAuth client ID from Google Cloud project "DK Jobs">`. It's public, not a secret. Without it, Settings → Google Calendar says "Not set up".

Domains use **http://**. Cloudflare does HTTPS; https here causes a redirect loop.

## Cloudflare
- Tunnel `nuc-server`: published application routes `timesheets` and `jobs` on `dkevent.co.uk`, type HTTP, URL `localhost:80` (same tunnel as Sky Spark, no new `cloudflared`).
- Access: application **Timesheets & Jobs** covering both hostnames, policy **Dan only** (Allow, one email), one-time PIN, separate from Sky Spark's.
- Don't touch the email DNS records (MX/SPF/DKIM/DMARC/autodiscover): keep them DNS only.

## Supabase Auth
Authentication → URL Configuration. Site URL: `https://timesheets.dkevent.co.uk`. Redirect URLs:
- `https://timesheets.dkevent.co.uk/**`
- `https://jobs.dkevent.co.uk/**`
- the Netlify URL (while it's the standby)

## Netlify standby
`netlify.toml` serves the repo as-is (no build): timesheet at `/`, jobs at `/jobs/`. The blank `js/site-config.js` files in the repo keep the old relative links.

**Failover if the NUC is down:**
1. Quickest: just use the Netlify address (bookmark it). Timesheet at `/`, jobs at `/jobs/`.
2. To keep the dkevent addresses working: in the tunnel, delete the `timesheets` and `jobs` routes, then add DNS records `timesheets` and `jobs` as CNAME to the Netlify address (proxied), and add both as domains on the Netlify site. Undo when the NUC is back.

Note: each site keeps its own login and its own copy of data in the browser (it syncs to Supabase). Before switching between Netlify and the NUC on a device, let it finish syncing.

## Status
Moved 2026-11. Phone tests on 4G passed: Access, logins, links between sites, `/jobs/` redirect, refresh, add/edit/delete, totals match Netlify.

## Build locally
```bash
TIMESHEETS_URL=https://timesheets.dkevent.co.uk JOBS_URL=https://jobs.dkevent.co.uk npm run build:jobs
```

## Google Calendar sync (jobs site)
- Google Cloud project **DK Jobs**: Google Calendar API enabled; OAuth consent screen in **Testing** with Dan as a test user; scope `calendar.app.created` (only calendars the app makes); OAuth client (Web) with JavaScript origin `https://jobs.dkevent.co.uk`.
- Code: `jobs/js/gcal.js`. Connect in Settings → Google Calendar. Keeps a "DK Jobs" Google calendar in step with jobs after each Save. Google access lasts an hour; the next tap gets a new one (a Google window may flash).
- The calendar's ID is stored in the account data (`settings.gcalCalendarId`) so every device uses the same calendar.
