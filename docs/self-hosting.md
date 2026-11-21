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

## Coolify (one project "Timesheets & Jobs", two resources)
For each resource: GitHub App, this repo, branch `main`. Build pack **Nixpacks**, tick **Is it a static site?**, publish directory `dist`.

| Setting | Timesheets | Jobs |
|---|---|---|
| Build command | `npm run build:timesheets` | `npm run build:jobs` |
| Domain | `http://timesheets.dkevent.co.uk` | `http://jobs.dkevent.co.uk` |

Env vars on **both** (tick "Build variable"):
- `TIMESHEETS_URL=https://timesheets.dkevent.co.uk`
- `JOBS_URL=https://jobs.dkevent.co.uk`

Domains use **http://**. Cloudflare does HTTPS; https here causes a redirect loop.

## Cloudflare
- Tunnel `nuc-server`: public hostnames `timesheets` and `jobs` on `dkevent.co.uk`, type HTTP, URL `localhost:80`.
- Access: one application covering both hostnames, allow-list policy.
- Don't touch the email DNS records (MX/SPF/DKIM/DMARC/autodiscover): keep them DNS only.

## Supabase Auth
Authentication → URL Configuration → Redirect URLs:
- `https://timesheets.dkevent.co.uk/**`
- `https://jobs.dkevent.co.uk/**`
- the Netlify URL (while it's the standby)

## Netlify standby
`netlify.toml` serves the repo as-is (no build): timesheet at `/`, jobs at `/jobs/`. The blank `js/site-config.js` files in the repo keep the old relative links.

**Failover if the NUC is down:** in Cloudflare, point both hostnames at the Netlify site. It's the combined app, so it covers both.

## Build locally
```bash
TIMESHEETS_URL=https://timesheets.dkevent.co.uk JOBS_URL=https://jobs.dkevent.co.uk npm run build:jobs
```
