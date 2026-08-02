# Deployment

fc-app runs on **Render** (two services) with **Neon** as the database. Every
part sits on a free plan, so the deployment costs nothing. The reasoning behind
the platform choice is [ADR-020](tech-decisions.md); this page is the runbook.

| Piece | Where | Plan | Sleeps? |
| --- | --- | --- | --- |
| `fc-app-web` — the Vite SPA | Render static site | Free | No. CDN-served, no instance hours. |
| `fc-app-api` — the oRPC server | Render web service | Free | Yes. After 15 min idle, ~1 min to wake. |
| PostgreSQL | Neon | Free | Scales to zero after 5 min; wakes on connect. |

The shape is declared in [`render.yaml`](../render.yaml) at the repo root, so
the services are reproducible rather than hand-clicked.

## What is not automated

Two things are deliberately manual: creating the accounts, and entering the
secrets. Nothing else needs the dashboard after the first deploy — pushing to
`main` redeploys both services.

## First-time setup

### 1. Accounts

**Render** — sign up at [render.com](https://render.com) **with GitHub**. That
grants the repo access auto-deploy needs. When prompted, choose *Only select
repositories* and pick `fc-app`.

**Neon** — sign up at [neon.com](https://neon.com), create a project in
**AWS eu-central-1 (Frankfurt)** to sit near the Render services, and copy the
connection string.

Edit the connection string before using it: Neon hands out `?sslmode=require`,
but `pg` 8.x logs a deprecation warning on every boot for anything other than
`verify-full`. Both verify the certificate, so use:

```
postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=verify-full
```

### 2. Google OAuth

In Google Cloud Console, open the OAuth 2.0 Client ID used for this app (or
create one of type *Web application*) and add the production redirect URI:

```
https://fc-app-api.onrender.com/auth/google/callback
```

Keep the localhost entry alongside it so local dev keeps working. Substitute the
real hostname if Render assigned a suffixed one — `onrender.com` subdomains are
globally unique, so `fc-app-api` may already be taken.

### 3. Create the services

In the Render dashboard: **New → Blueprint**, select the `fc-app` repo. Render
reads `render.yaml` and prompts for every `sync: false` variable.

Fill in for **fc-app-api**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The Neon string from step 1 |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `AUTH_CALLBACK_URL` | `https://fc-app-api.onrender.com/auth/google/callback` |
| `FRONTEND_URL` | `https://fc-app-web.onrender.com` |

Leave **fc-app-web**'s `VITE_API_URL` blank for now — the API's real hostname is
not known until it deploys. `FRONTEND_URL` has the same chicken-and-egg problem;
guess the name, then correct it in step 4 if Render suffixed it.

### 4. Close the loop

Once both services are live, note their actual URLs, then:

1. Set `VITE_API_URL` on **fc-app-web** to the API's URL, e.g.
   `https://fc-app-api.onrender.com`. **No trailing slash.**
2. Confirm `FRONTEND_URL` on **fc-app-api** matches the web URL exactly —
   scheme and host, no trailing slash. It is both the post-sign-in redirect
   target and the allowed CORS origin, so a mismatch breaks sign-in twice over.
3. Redeploy **fc-app-web**. `VITE_API_URL` is compiled into the bundle, so
   setting it is not enough on its own.

### 5. Verify

Visit the web URL and sign in with Google. If the first request hangs for about
a minute, that is the API waking, not a fault.

## The CLI

Optional, but better than the dashboard for day-to-day work:

```bash
brew install render
```

```bash
render login
```

Useful commands:

```bash
render services            # list services and their status
render deploys create      # trigger a deploy
render logs --tail         # live logs
render psql                # psql session against a Render datastore
render blueprints validate # check render.yaml before committing
```

The CLI cannot create an account, and it cannot launch a Blueprint — that first
step is dashboard-only. After that it can do everything else.

## Migrations

Migrations run automatically as the last step of the API's **build command**,
once per deploy and before the new code goes live. Render's pre-deploy hook,
the more natural home, is paid-only.

One consequence to keep in mind: a build that migrates successfully and then
fails to deploy leaves the schema ahead of the running code. Keep migrations
backwards-compatible with the previous release — add columns before you use
them, drop them a release later.

To run migrations by hand:

```bash
DATABASE_URL='postgresql://…' npm run migrate:deploy -w apps/backend
```

## Environment variables

`render.yaml` sets these; they are listed here so the deployed contract is
readable in one place.

| Variable | Service | Set by | Notes |
| --- | --- | --- | --- |
| `PORT` | api | Render | Injected. The server prefers it over `BACKEND_PORT`. |
| `NODE_ENV=production` | api | `render.yaml` | Also hard-blocks the dev sign-in route from loading. |
| `COOKIE_SECURE=true` | api | `render.yaml` | Drives `Secure` **and** `SameSite=None`. See below. |
| `DATABASE_URL` | api | You | Neon, `sslmode=verify-full`. |
| `GOOGLE_CLIENT_ID` / `_SECRET` | api | You | |
| `AUTH_CALLBACK_URL` | api | You | Must match Google Cloud Console exactly. |
| `FRONTEND_URL` | api | You | Redirect target *and* CORS origin. |
| `VITE_API_URL` | web | You | Build-time. Redeploy after changing. |
| `VITE_ENABLE_DEV_LOGIN=false` | web | `render.yaml` | |

`ENABLE_DEV_LOGIN` and `VITE_ENABLE_DEV_LOGIN` must never be true in production.
The backend refuses to load the route when `NODE_ENV=production` regardless, but
do not rely on one guard alone.

## Why the session cookie is `SameSite=None`

The SPA and the API are separate hosts, and `onrender.com` is on the Public
Suffix List, so browsers treat the two subdomains as different sites. A
`SameSite=Lax` cookie is not attached to the SPA's `fetch` calls, which fails in
a nasty way: sign-in redirects back looking successful, then every API call is
anonymous.

[`auth/cookies.ts`](../apps/backend/src/auth/cookies.ts) therefore emits
`SameSite=None; Secure` whenever `COOKIE_SECURE=true`, and `SameSite=Lax`
locally where both halves share `localhost`. One flag drives both attributes
because `None` without `Secure` is rejected outright by browsers.

## Free-tier limits worth knowing

- **750 instance hours per month, pooled across the whole Render workspace** —
  not per service. One always-on service uses ~730. Adding a second free web
  service (a staging API, say) blows the budget, and Render then suspends *all*
  free web services until the next month. Static sites cost no hours.
- **Neon: 0.5 GB storage, 100 compute-hours per month.** Scale-to-zero means an
  idle database burns nothing.
- **Render free services have no persistent disk.** Anything written to the
  filesystem is lost on restart, redeploy, and every wake from sleep. All state
  belongs in Postgres.

## Getting rid of the cold start

Upgrade **only** `fc-app-api` to Render Starter (~$7/month) and set
`plan: starter` in `render.yaml`. The static site stays free forever, so this is
the single upgrade the project realistically ever needs. Do not paper over the
sleep with an external uptime pinger — it burns the 750-hour pool by keeping the
service awake around the clock, and Render suspends the service when it runs out.
