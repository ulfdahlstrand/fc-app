# CLAUDE.md

Notes for Claude working in this repo. The real documentation lives in `docs/`
and should be read before changing anything structural:

- `docs/product/product-spec.md` — what the product is, page by page
- `docs/architecture.md` — components and the stack
- `docs/tech-decisions.md` — ADR-001…ADR-023, the binding technical rules
- `docs/design-decisions.md` — DDR-001…DDR-010, the Kit design language

## Recording a demo video when a task is finished

`tools/demo-video` drives the real app in a real browser and records an MP4:
visible pointer, captions, human pacing. Its README covers the mechanics; this
section is about **when to reach for it and what to watch out for**.

### Why it is worth the minutes

It is a form of testing, not decoration. The first recording made with it found
two bugs that the unit tests, the integration tests and a careful manual pass
had all missed — a dialog that blocked submit silently, and a save button that
fell below the fold at 720p — because it drove the app the way a person does, at
a window size a person has. Flows assert what they claim to be showing and fail
rather than recording something else.

So treat a recording as a last verification pass on user-visible work, and read
its output: the assertions it prints are the point, not just the file.

### When to record

Record at the end of a task when **all** of these hold:

- The change is visible in the UI. A contract, handler or migration change with
  no screen to show has nothing to record.
- A flow in `tools/demo-video/flows/` covers it, **or** the feature is a
  substantial new surface that deserves its own flow.
- You can get an empty database without destroying anything the user wants —
  see the warning below.

Do **not** record as a reflex at the end of every task. It costs several minutes
of wall clock, needs the whole stack running, and a video of an unchanged screen
is noise.

If the user asked for a video, record one even if the change was small.

### The database warning — read before running

Flows that start from onboarding declare `requiresEmptyDatabase: true`, and the
recorder **refuses to run** against a database with data in it. It prints the
reset command and stops. It never resets anything itself, deliberately.

That means recording usually requires wiping the development database:

```bash
# DATABASE_URL lives in .env; export it or paste the value in
psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
npm run migrate -w apps/backend
```

**Ask the user before doing that.** It destroys whatever they have locally —
their test club, their roster, their fixtures. In a disposable environment
(a fresh container, CI, a scratch database) go ahead; on a machine that might be
someone's actual working copy, ask first or skip the recording and say why.

### Running it

```bash
# the stack, from the repo root
npm run docker:up
npm run migrate -w apps/backend
npm run dev

# the recording
cd tools/demo-video
npm install                       # first time only
npm run record player-development
```

`npm run flows` lists what exists. The file lands in `out/`, which is
gitignored.

Two things that will bite in a sandbox:

- Sign-in uses the dev bypass, so the backend needs `ENABLE_DEV_LOGIN=true` in
  `.env`. The recorder says so plainly if it is off.
- If Chromium is provisioned outside Playwright's own cache, or is a different
  build than this Playwright version expects, point at it explicitly:
  `DEMO_CHROMIUM=/path/to/chrome npm run record <flow>`.

### After recording

- **Look at the video before handing it over.** Extract a few frames and check
  them — that the pointer is visible, the captions readable, no dialog stuck
  half-open, and that the part the task was about is actually on screen. A
  recording that scrolled past the payoff has happened.
- Send it to the user as a file. Do **not** commit it: `out/` is gitignored
  because every recording is several MB of binary that would stay in history.
- It cannot be attached to a pull request programmatically. GitHub accepts MP4
  in comments only through drag-and-drop in the web UI, so hand the user the
  file and say so rather than promising it will appear on the PR.
- If the recording failed, `out/<flow>-fail.png` holds the failing screen along
  with the URL, open dialogs and headings. The partial video is discarded on
  purpose — a half-recording is easy to mistake for a good one.

### Writing a new flow

One file in `flows/`, exporting `meta` and a default function that takes the
driver. Copy the shape from `flows/player-development.mjs` and keep its habit of
asserting as it goes.

The driver's `click`, `scrollTo` and the cursor overlay each exist because the
obvious approach produced a bad recording; the reasons are commented where they
are defined in `src/driver.mjs`. Read those before working around them.
