# Coolify build for one section of the site (timesheets or jobs), served by nginx.
# Coolify passes these as build arguments (tick "Available at Buildtime" on each):
#   SITE_SECTION      timesheets | jobs
#   TIMESHEETS_URL    https://timesheets.dkevent.co.uk
#   JOBS_URL          https://jobs.dkevent.co.uk
#   GOOGLE_CLIENT_ID  jobs only, optional (public, not a secret)
#   GOOGLE_PLACES_KEY jobs only, optional (browser key, locked to jobs.dkevent.co.uk)
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
ARG SITE_SECTION
ARG TIMESHEETS_URL
ARG JOBS_URL
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_PLACES_KEY
RUN node scripts/build.mjs "$SITE_SECTION"

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
