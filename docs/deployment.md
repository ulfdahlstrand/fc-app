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

The browser never talks to `fc-app-api` directly. A rewrite rule on the static
site proxies `/api/*` to it, so the whole app lives on one origin — see
[Why the API is proxied](#why-the-api-is-proxied) below, and
[ADR-021](tech-decisions.md).

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
https://fc-app-web.onrender.com/api/auth/google/callback
```

Note the host: **the web service, through the `/api` proxy**, not the API's own
hostname. The callback is what sets the session cookie, so it has to land on the
origin the SPA runs on.

Keep the localhost entry alongside it so local dev keeps working. Substitute the
real hostname if Render assigned a suffixed one — `onrender.com` subdomains are
globally unique, so `fc-app-web` may already be taken.

### 3. Create the services

In the Render dashboard: **New → Blueprint**, select the `fc-app` repo. Render
reads `render.yaml` and prompts for every `sync: false` variable.

Fill in for **fc-app-api**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The Neon string from step 1 |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `AUTH_CALLBACK_URL` | `https://fc-app-web.onrender.com/api/auth/google/callback` |
| `FRONTEND_URL` | `https://fc-app-web.onrender.com` |

Both point at the *web* service, whose hostname is not known until it deploys —
guess the name, then correct it in step 4 if Render suffixed it. `VITE_API_URL`
needs nothing from you: `render.yaml` pins it to `/api`.

### 4. Close the loop

Once both services are live, note their actual URLs, then:

1. Confirm `FRONTEND_URL` on **fc-app-api** matches the web URL exactly —
   scheme and host, no trailing slash. It is both the post-sign-in redirect
   target and the allowed CORS origin, so a mismatch breaks sign-in twice over.
2. Confirm `AUTH_CALLBACK_URL` is that same origin plus
   `/api/auth/google/callback`, and that Google Cloud Console lists it verbatim.
3. If Render suffixed the **API**'s hostname, correct the `/api/*` rewrite
   destination in `render.yaml` and push — that one is committed, not an env
   var.

### 5. Verify

Visit the web URL and sign in with Google. If the first request hangs for about
a minute, that is the API waking, not a fault.

**Test on a phone too, not only on a desktop browser.** Desktop Chrome is the
most permissive browser there is about cookies; iOS and Firefox are the ones
that catch a broken cookie setup.

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
| `COOKIE_SECURE=true` | api | `render.yaml` | Marks the session cookie `Secure`. |
| `DATABASE_URL` | api | You | Neon, `sslmode=verify-full`. |
| `GOOGLE_CLIENT_ID` / `_SECRET` | api | You | |
| `AUTH_CALLBACK_URL` | api | You | The **web** origin + `/api/auth/google/callback`. Must match Google Cloud Console exactly. |
| `FRONTEND_URL` | api | You | Redirect target *and* CORS origin. |
| `VITE_API_URL=/api` | web | `render.yaml` | Build-time. Relative, so it resolves to the page's own origin. |
| `VITE_ENABLE_DEV_LOGIN=false` | web | `render.yaml` | |

`ENABLE_DEV_LOGIN` and `VITE_ENABLE_DEV_LOGIN` must never be true in production.
The backend refuses to load the route when `NODE_ENV=production` regardless, but
do not rely on one guard alone.

## Why the API is proxied

The two services are separate hosts, and `onrender.com` is on the Public Suffix
List, so browsers treat the subdomains as different **sites**. Talking to
`fc-app-api` directly would make the session cookie third-party, and iOS —
Safari, Chrome and Firefox alike, they all run on WebKit there — blocks
third-party cookies outright, as does desktop Firefox. The failure is a nasty
one: sign-in redirects back looking successful, then every API call is
anonymous, so the app bounces you to `/login` forever. Desktop Chrome still
allows the cookie, which is exactly why this hides from the browser you develop
in.

So the static site owns the origin and forwards to the API:

```yaml
- type: rewrite
  source: /api/*
  destination: https://fc-app-api.onrender.com/*
```

The splat drops the prefix, so `/api/me` arrives at the backend as `/me` and no
route needs to know it is proxied. `VITE_API_URL=/api` and
`AUTH_CALLBACK_URL=…/api/auth/google/callback` are the two halves that must
agree with the rule. With everything on one origin,
[`auth/cookies.ts`](../apps/backend/src/auth/cookies.ts) emits plain
`SameSite=Lax`, and `COOKIE_SECURE` only adds `Secure`.

CORS stays configured on the backend even though same-origin requests do not
need it — local development still runs the SPA on `:4173` against the API on
`:4001`.

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
