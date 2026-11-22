// Builds one section of the site into dist/ for Coolify.
//   npm run build:timesheets   or   npm run build:jobs
// Needs the env vars TIMESHEETS_URL and JOBS_URL (full https:// URLs).
// No packages needed: it only copies files and writes js/site-config.js.
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const section = process.argv[2];
if (section !== "timesheets" && section !== "jobs") {
  console.error("Usage: node scripts/build.mjs timesheets|jobs");
  process.exit(1);
}
const clean = (v) => String(v || "").trim().replace(/\/+$/, "");
const timesheetsUrl = clean(process.env.TIMESHEETS_URL);
const jobsUrl = clean(process.env.JOBS_URL);
// Optional: Google OAuth client ID for the jobs site's Google Calendar sync (public, not a secret).
const googleClientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
if (!/^https?:\/\//.test(timesheetsUrl) || !/^https?:\/\//.test(jobsUrl)) {
  console.error("Set TIMESHEETS_URL and JOBS_URL (e.g. https://timesheets.example.com) before building.");
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const copy = (from, to) => cpSync(join(root, from), join(dist, to), { recursive: true });
const siteConfig =
  "/* Written by scripts/build.mjs - do not edit in dist/. */\n" +
  "window.DK_SITE = " + JSON.stringify({ section, timesheetsUrl, jobsUrl, googleClientId }) + ";\n";

// A tiny page that sends old links (e.g. /jobs/#/jobs/J0001) to the right site, keeping the #... part.
const redirectPage = (target) =>
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Moved</title>' +
  '<meta name="robots" content="noindex">' +
  '<script>location.replace(' + JSON.stringify(target) + ' + location.hash);</script>' +
  '</head><body><a href="' + target + '">This page has moved</a></body></html>\n';

if (section === "timesheets") {
  copy("index.html", "index.html");
  copy("css", "css");
  copy("js", "js");
  // Old combined-site links to /jobs/... go to the jobs site.
  mkdirSync(join(dist, "jobs"), { recursive: true });
  writeFileSync(join(dist, "jobs", "index.html"), redirectPage(jobsUrl + "/"));
} else {
  copy("jobs", ".");
  // Jobs shares the base stylesheets with the timesheet; on its own site they live next to jobs.css.
  copy("css/styles.css", "css/styles.css");
  copy("css/theme.css", "css/theme.css");
  const html = join(dist, "index.html");
  writeFileSync(html, readFileSync(html, "utf8").replaceAll('href="../css/', 'href="css/'));
  // An old /jobs/... link that lands here goes to the jobs home page.
  mkdirSync(join(dist, "jobs"), { recursive: true });
  writeFileSync(join(dist, "jobs", "index.html"), redirectPage(jobsUrl + "/"));
}
writeFileSync(join(dist, "js", "site-config.js"), siteConfig);
console.log("Built " + section + " into dist/ (timesheets: " + timesheetsUrl + ", jobs: " + jobsUrl + ")");
