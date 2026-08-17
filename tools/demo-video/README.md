# demo-video

Records click-through videos of the app: a real browser, a visible pointer,
captions, and human pacing. One command produces an MP4.

It is also a form of testing. The first recording made with it found two bugs
that the unit, integration and manual checks had all missed — a dialog that
blocked submit silently, and a save button that fell below the fold at 720p —
because it drove the app the way a person does, at a window size a person has.
Flows assert what they claim to be showing and fail rather than quietly
recording something else.

## Why this is not a workspace

The repo's workspaces are `apps/*` and `packages/*`. This directory is
deliberately outside them, with its own `package.json` and its own
`npm install`.

Playwright and ffmpeg together are ~80 MB plus a browser download. As a
workspace they would land in every `npm install`, CI included, for everyone who
never records anything. Being outside also keeps `turbo` away from it — `build`,
`lint`, `typecheck` and `test` only run in workspaces — and out of Tailwind's
source scanning, which starts from `apps/frontend`.

## Setup

```bash
cd tools/demo-video
npm install
npx playwright install chromium   # unless a Chromium is already provisioned
```

## Recording

The app has to be running, and this flow records from an empty database:

```bash
# from the repo root
npm run docker:up
npm run migrate -w apps/backend
npm run dev

# then
cd tools/demo-video
npm run record player-development
```

The file lands in `out/` (gitignored). `npm run flows` lists what is available.

**The database is yours to reset.** The recorder checks whether one is needed
and stops with the exact command if so — it never drops anything itself.

## Configuration

All optional; the defaults match `.env.example`.

| Variable | Default | |
|---|---|---|
| `DEMO_APP_URL` | `http://localhost:4173` | the SPA |
| `DEMO_API_URL` | `http://localhost:4001` | the API, for sign-in and preflight |
| `DEMO_LANG` | `sv` | passed as `?lng=` |
| `DEMO_OUT` | `out` | relative to this directory |
| `DEMO_CHROMIUM` | *(unset)* | explicit Chromium binary |

`DEMO_CHROMIUM` is the escape hatch for environments where a browser is
provisioned outside Playwright's own cache, or is a different build number than
this Playwright version looks for. Leave it unset on a normal machine.

Sign-in uses the dev bypass, so the backend needs `ENABLE_DEV_LOGIN=true`. The
recorder says so plainly if it is off.

## Adding a flow

A flow is one file in `flows/` exporting `meta` and a default function:

```js
export const meta = {
  title: "What this shows",
  viewport: { width: 1280, height: 720 },
  requiresEmptyDatabase: true,
};

export default async function run(d) {
  await d.say("A sentence the viewer reads");
  await d.click(d.nav("Medlemmar"));
}
```

`d` carries the driver: `page`, `dlg()`, `say`, `clearCaption`, `click`, `type`,
`fillDate`, `scrollTo`, `nav`, `goto`, `pause`, `log`.

Three of those exist because the obvious approach produced a bad recording, and
they are worth knowing before writing a flow:

- **`click` refuses a target outside the viewport.** `page.mouse.move` clamps to
  the viewport, so a button below the fold gets clicked somewhere else — and
  over a modal that dismisses it instead of pressing it. Silently. Rather than
  produce a video of something that never happened, it throws.
- **`scrollTo`, not `scrollIntoViewIfNeeded`.** The latter does nothing once an
  element is technically visible at the bottom edge, which leaves everything
  below it off camera. `scrollTo` wheels it up to the top, and looks like
  scrolling while it does.
- **`nav` rather than `goto`.** Clicking a nav pill keeps it an SPA transition:
  closer to real use, and one less full reload.

Assert as you go. `expectMetric` in `player-development.mjs` is the pattern —
check that the thing you just demonstrated actually happened, and throw if not.
On failure the runner writes `out/<flow>-fail.png` with the URL, open dialogs
and headings, and discards the partial recording.
