# Technical Decisions (ADR Log)

> Append-only. Never delete or modify past decisions.

## Template
### [DATE] - [DECISION TITLE]
**Status:** Proposed | Accepted | Superseded  
**Context:** Why was this decision needed?  
**Decision:** What was decided?  
**Consequences:** What does this mean going forward?

---

## ADR-001 — 2026-07-15 — Adopt the project-enigma technical foundation

**Status:** Accepted

**Context:**
FC App needs a technical foundation. The `project-enigma` repository (CV tool)
has a proven setup: Turborepo + npm workspaces, strict TypeScript everywhere,
React/Vite/MUI/TanStack frontend, Node.js/oRPC/Kysely backend, shared Zod
contracts, PostgreSQL, and Docker Compose for local orchestration. Reusing it
avoids re-deciding solved problems and keeps both projects familiar to work in.

**Decision:**
Adopt project-enigma's stack, monorepo layout, and conventions wholesale:
- Turborepo + npm workspaces (`apps/*`, `packages/*`)
- TypeScript strict mode in all workspaces via a shared `tsconfig` package
  (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Contract-first API: oRPC + Zod schemas in a shared `contracts` package
- Frontend: React + Vite + Material UI + TanStack Router/Query + react-i18next
- Backend: Node.js + oRPC (OpenAPI handler) + Kysely + PostgreSQL
- Docker Compose for local development (`docker/`)

**Consequences:**
- Conventions documented in project-enigma's ADRs (monorepo orchestration,
  TypeScript-only policy, canonical folder structure) apply here as well.
- Deviations from the enigma setup must be recorded as new ADRs in this log.

---

## ADR-002 — 2026-07-15 — `@fc-app/` scoped package naming

**Status:** Accepted

**Context:**
Workspace packages reference each other by `package.json` name. A private npm
scope avoids collisions with public packages and makes ownership obvious.

**Decision:**
Every workspace uses the **`@fc-app/`** scope; the short name after the scope
matches the folder name (`apps/frontend/` → `@fc-app/frontend`,
`packages/contracts/` → `@fc-app/contracts`, etc.). All packages are
`"private": true`; the scope is not registered on the public npm registry.

**Consequences:**
- Cross-workspace imports use the scoped name
  (`import { contract } from "@fc-app/contracts"`).
- Future packages must follow the same `@fc-app/<folder-name>` pattern.

---

## ADR-003 — 2026-07-15 — Multi-tenant model: clubs → teams, row-level isolation

**Status:** Accepted

**Context:**
The app must serve any club that registers (user decision, 2026-07-15), not a
single installation per team. Options: separate database per tenant, separate
schema per tenant, or shared tables with row-level tenancy.

**Decision:**
Shared tables with **row-level tenancy**. The tenant root is the **club**;
clubs contain **teams**; nearly all domain data belongs to a team (and thereby
a club). Every domain table carries a `club_id` or reaches one via its parent,
and every query is scoped by the caller's club/team context, derived from
their membership — never from client-supplied ids alone.

**Consequences:**
- Simplest operational model (one database, one migration path).
- Tenant scoping is a correctness requirement in every procedure; helpers for
  scoped queries should be introduced with the first domain feature.
- Per-tenant export/erasure (GDPR) must be implemented as queries, which the
  row-level model supports.

---

## ADR-004 — 2026-07-15 — Authentication via OAuth (Google first), backend-managed sessions

**Status:** Accepted

**Context:**
project-enigma has no authentication, so this is a new decision. The user
chose Google/Apple sign-in over passwords or magic links. Apple's "Sign in
with Apple" requires a paid Apple Developer account.

**Decision:**
- OAuth 2.0 / OpenID Connect sign-in, **Google first**; Apple is added later
  behind the same provider abstraction (an `identities` table keyed by
  provider + subject, so one user can have several identities).
- The backend manages its own **sessions** (HTTP-only secure cookie backed by
  a `sessions` table). No passwords are ever stored.
- Users invited by a club join via invitation links tied to a preset role.

**Consequences:**
- Requires a Google OAuth client (redirect URIs per environment) configured
  via environment variables.
- The provider abstraction must not assume Google-specific claims.
- Email is taken from the OIDC profile; account linking by verified email.

---

## ADR-005 — 2026-07-15 — Flexibility through configuration entities

**Status:** Accepted

**Context:**
The product's core principle is that teams adapt the app to their needs
(product-spec). This must be an architectural rule, not an afterthought.

**Decision:**
Anything that plausibly varies between teams is modelled as **data, not
code**, editable in the settings pages and seeded with defaults on team
creation:
- **Member field definitions** (typed custom fields: text, number, date,
  boolean, select) + per-member values
- **Activity types** (seeded: Training, Match)
- **Attendance statuses** (seeded: Present, Absent, Ill)
- **Roles** as named permission sets over a fixed, code-defined permission
  catalog (seeded: Admin, Coach, Player, Guardian)
- **Tracking list definitions** (checklist items like "Grönt kort",
  "discount booklet picked up") + per-member entries

**Consequences:**
- Slightly more generic data model (definition + value tables) instead of
  fixed columns; queries and UI must be built definition-driven from the start.
- The permission catalog is the one fixed axis: new *permissions* require
  code changes; new *roles* do not.
- Seeding logic runs at team creation and must stay in sync with the docs.

---

## ADR-006 — 2026-07-15 — Kysely Migrator as the single migration mechanism

**Status:** Accepted

**Context:**
project-enigma contains two migration mechanisms (dbmate SQL migrations in
Docker Compose, and a Kysely Migrator CLI in the backend, per its ADR-012).
FC App should not inherit that duplication.

**Decision:**
**Kysely Migrator only.** TypeScript migration files live in
`apps/backend/src/db/migrations/` (named `YYYYMMDDHHMMSS_description.ts`), run
via `npm run migrate -w apps/backend`. In Docker Compose, a one-shot
`migrate` service runs the same script before the backend starts.

**Consequences:**
- One migration format (TypeScript, type-checked) and one runner everywhere.
- Migrations are append-only; schema types in `src/db/types.ts` are updated
  by hand alongside each migration.

---

## ADR-007 — 2026-07-22 — UI-lager: byt Material UI mot shadcn/ui + Tailwind; type-safe formulär med react-hook-form

**Status:** Accepted (deviation från ADR-001)

**Context:**
ADR-001 antog project-enigmas stack rakt av, inklusive **Material UI** (MUI) +
Emotion. Två skäl driver ett byte:
1. **Ägd komponentkod.** shadcn/ui kopieras in i repot (`src/components/ui/`)
   i stället för att konsumeras som ett svartlåde-bibliotek — komponenterna kan
   ändras fritt och har ingen tung runtime-CSS-in-JS.
2. **Type-safety hela vägen i formulär.** oRPC, Zod, TanStack Query och
   TanStack Router finns redan, men formulär är idag handrullade med `useState`
   och manuell validering. Vi vill härleda formulärvalidering ur samma Zod-
   scheman som API-kontraktet (`@fc-app/contracts`) via **react-hook-form** +
   `zodResolver`, så att klient- och servervalidering aldrig driftar isär.

**Decision:**
- Ersätt **MUI + Emotion** med **shadcn/ui** (Tailwind v4 + Radix-primitiver).
  Tailwind konfigureras via `@tailwindcss/vite`; design-tokens uttrycks som
  CSS-variabler. Bas-komponenter bor under `apps/frontend/src/components/ui/`.
- Inför **react-hook-form** + `@hookform/resolvers` (`zodResolver`).
  Formulärscheman härleds ur kontraktets input-scheman i stället för att
  dupliceras.
- Behåll oRPC, Zod och TanStack Router/Query (redan på plats). Query-lagret
  kan senare byta till `@orpc/tanstack-query` för typade utils (eget ärende).
- **Migreringen görs stegvis med samexistens:** Tailwind + shadcn läggs in
  bredvid MUI och skärmar migreras en och en. MUI/Emotion tas bort först när
  inga imports återstår. Se epic **#29** och delärenden **#30–#38**.

**Consequences:**
- ADR-001 står kvar (append-only); denna ADR är det dokumenterade avsteget.
- Under samexistensfasen kan mindre visuella krockar mellan Tailwinds preflight
  och MUI:s `CssBaseline` förekomma; de upphör när MUI tas bort i slutstädningen.
- En ESLint-regel (`no-restricted-imports`) som blockerar `@mui/*` och
  `@emotion/*` införs när sista skärmen är migrerad (#37), så beroendet inte
  smyger tillbaka.
- Nya beroenden: `tailwindcss`/`@tailwindcss/vite`, `class-variance-authority`,
  `clsx`, `tailwind-merge`, `lucide-react`, relevanta `@radix-ui/*`,
  `react-hook-form`, `@hookform/resolvers`.

---

## ADR-008 — 2026-07-29 — Recurring activities: a series template plus materialised occurrences

**Status:** Accepted

**Context:**
Trainings repeat weekly (#13). Two shapes were available:

1. **Virtual occurrences** — store only a recurrence rule and expand it at read
   time, with an exception table for edited or cancelled instances.
2. **Materialised occurrences** — store a template *and* write concrete
   `activities` rows for each occurrence.

Attendance (#14), call-ups (#16) and statistics (#15) all attach records to a
specific activity. Under (1) they would have to attach to something that does
not exist as a row until it is read, forcing every one of those features to
understand recurrence.

A second constraint: Sweden moves its clocks twice a year. A training is at
18:00 in the club's own time on both sides of that change, so occurrences
cannot be generated by adding 7×24h.

**Decision:**
**Materialised occurrences.** `activity_series` holds the template; each
occurrence is an ordinary `activities` row carrying `series_id`.

- The template stores **local wall time**, not instants: a weekday set
  (ISO 1–7, so one series covers "Tuesdays and Thursdays"), a `time` of day, a
  `date` range, and the **IANA timezone** those are read in (sent by the
  browser at creation). Occurrences are built per calendar date through
  `date-fns-tz`, which keeps 18:00 at 18:00 across a DST change.
- A series is capped at `MAX_SERIES_OCCURRENCES` (400). "Every Tuesday until
  2099" is a typo, not a plan.
- Creation is one transaction — a series whose occurrences half-exist is worse
  than no series.
- `series_id` is `ON DELETE SET NULL`: an occurrence outlives its template,
  keeping its attendance and call-ups as an ordinary one-off.
- **Edit scope.** "This occurrence" is a single-row update. "This and
  following" also rewrites every later occurrence *and* the template. Type,
  title, location and notes carry over; a changed **time of day** carries over,
  but the dates do not — each later occurrence keeps the day it is on.
  Cancelling is always per-occurrence, so one called-off training is never
  resurrected by a later edit.

**Seasons** are a separate, simpler decision: a named date range, with **no
foreign key from activities**. Membership is derived from the activity's start
date falling inside the range, so correcting a season's dates re-answers the
question for every activity at once instead of leaving rows pointing at the
wrong season.

**Consequences:**
- Every later feature can treat an activity as an activity. Nothing downstream
  of #13 needs to know recurrence exists.
- Extending a series (moving `until` later) means generating more rows; the
  template carries everything needed to do it, but the procedure is not built
  yet — it is the obvious next addition.
- Changing a recurrence *rule* (its weekdays or date range) after creation is
  not supported. "This and following" covers the common case; a rule change
  would mean deleting and regenerating rows that may already carry attendance.
- The season filter reads its boundaries as UTC midnight, because teams carry
  no timezone. Only an activity within a couple of hours of midnight on a
  season's first or last day can land on the wrong side; revisit if teams ever
  gain a zone.
- New backend dependencies: `date-fns`, `date-fns-tz`.

---

## ADR-009 — 2026-07-30 — Time: instants on the wire, local wall time on screen

**Status:** Accepted

**Context:**
Three representations of time are in play and mixing them produces bugs that only
show up twice a year or west of UTC: ISO instants in the API, the viewer's local
wall time on screen, and `<input type="datetime-local">`, which has no zone at
all and holds `"2026-08-01T17:30"` meaning "17:30 where I am".

**Decision:**
- The API speaks **ISO instants with an offset** (`isoInstantSchema`). Postgres
  columns are `timestamptz`.
- A **date** that is a day rather than a moment is a `date` column and a
  `"YYYY-MM-DD"` string: `seasons.starts_on`, `activity_series.starts_on`,
  tracking `date` values. A season starts on a day, not at an instant.
- Both conversions live in `frontend/src/lib/dates.ts` **and nowhere else**.
  `toDateTimeInput` / `fromDateTimeInput` are the only bridge to and from the
  zone-less input; `toISOString()` slicing is never used for it.
- Series templates store local wall time plus an IANA zone (ADR-008), and
  occurrences are resolved per calendar date through `date-fns-tz`.
- Ranges are **half-open**: `to` is the first instant *after* the window, so two
  adjacent month grids never both claim the same activity.
- Weeks start on Monday.

**Consequences:**
- A new date field must be classified as instant-or-day before it is added.
- `browserTimeZone()` falls back to `Europe/Stockholm`: a series that is
  wrong by an hour beats one that fails to be created.
- The season filter reads its boundaries as UTC midnight because teams carry no
  timezone (see ADR-008's consequences).

---

## ADR-010 — 2026-07-30 — Shared rules live in the contract, not on both sides of the wire

**Status:** Accepted

**Context:**
Several rules are needed by the backend to enforce and by the frontend to render:
what makes a field value valid, what counts as "at risk", whether a tracking box
is settled. Implemented twice, they drift — and the visible symptom is a number
on one screen contradicting the screen it links to.

**Decision:**
Rules that both sides need are **pure functions and constants exported from
`@fc-app/contracts`**, alongside the schemas they belong to:

- `validateMemberFieldValue`, `validateTrackingValue` — validate and normalise.
- `isAtRisk`, `AT_RISK_RATE`, `AT_RISK_MIN_MARKED` — the attendance threshold.
- `isTrackingComplete` — whether a definition is settled for a member.
- `postWriteFields`, `memberWriteFields` and friends — the field rules a form
  builds its schema from (ADR-007), so lengths and formats are stated once.

Frontend `lib/*` re-exports rather than reimplements
(`export { AT_RISK_RATE, isAtRisk } from "@fc-app/contracts"`).

**Consequences:**
- The contract package holds a little logic, not only schemas. That is the point.
- These functions are the ones most worth testing, and they are tested from the
  backend suite (the contracts package has no test runner of its own).
- A rule expressed as SQL for performance must cite the function it mirrors, so
  the two are found together.

---

## ADR-011 — 2026-07-30 — Read and write gates are chosen per question, not per feature

**Status:** Accepted

**Context:**
It is tempting to give each feature one permission. That produces either a role
that can see a calendar it cannot label, or a permission granted so widely it
means nothing.

**Decision:**
Permissions gate *questions*, and a feature may use several:

| Question | Gate |
|---|---|
| Can I see the team's people, calendar, statistics, matrix? | `members.view` |
| Can I change team configuration? | `settings.team` |
| Can I record attendance / tick tracking / manage squads / write posts? | `attendance.record` / `tracking.manage` / `callups.manage` / `posts.manage` |
| Can I answer for a member I am linked to? | `callups.respond` **plus** a guardian link (#9) |
| Can I read the noticeboard? | **team access alone** |

Two consequences of that last row are deliberate: being announced to is what
belonging to a team means, so reading posts needs no permission; and holding
`members.view` grants no sight of a *targeted* post, because seeing the roster
and being addressed by an announcement are different questions.

Reads that render a composite page use `requireTeamAccess` and then decide
**per widget** (ADR-015), so nobody is shown an empty frame belonging to someone
else's role.

**Consequences:**
- `tracking.manage` exists separately from `members.manage` so a club can hand
  out "chase the paperwork" without handing over the roster.
- A new procedure must state which question it answers before picking a gate.

---

## ADR-012 — 2026-07-30 — Attendance rate is attended ÷ marked

**Status:** Accepted

**Context:**
The intuitive denominator is "sessions held". Using it makes every member's rate
fall whenever a coach forgets to take attendance, which punishes the squad for
the coach's phone.

**Decision:**
The rate is **attended ÷ marked**. A session nobody was marked at is *unknown*,
not an absence, and contributes to neither side. `activities` is reported
alongside so the gap between it and `marked` is visible as coverage a coach may
want to close. `null` is returned when nothing is marked — no rate can be
honestly stated.

The team rate is computed from the **totals**, not as an average of member rates,
so someone marked once at 100% does not weigh as much as someone marked twenty
times. Cancelled activities are excluded everywhere: a called-off training is not
a session anyone failed to attend. Archived *statuses* still count — a record
made under "Late" before it was retired was a presence then and stays one now.

The arithmetic is a pure function (`attendance/summarise.ts`) over rows the
handler has already fetched, rather than SQL. A team-season is hundreds of rows,
and this is the part a coach will check by hand.

**Consequences:**
- Members with nothing marked have no rate and sort last; the list is ordered
  lowest-rate-first, because the page exists to surface who is drifting away.
- "At risk" is a shared threshold (ADR-010), not a per-screen judgement.

---

## ADR-013 — 2026-07-30 — Draft until told

**Status:** Accepted

**Context:**
Picking a squad and telling people are different acts, and so are writing an
announcement and publishing it. Without a draft state, half-finished work is
already visible to the team.

**Decision:**
Anything the team is *told* has an explicit published state:

- `callups.published` — a boolean; a squad is a draft until a coach publishes.
- `posts.published_at` — nullable; `null` is a draft, and the timestamp doubles
  as the publication date.

Unpublished records are visible only to callers who may manage them, and are
excluded from every count and notification. Re-publishing **keeps the original
date**: a corrected typo does not make an announcement new and must not jump
back to the top of the feed.

**Consequences:**
- Dashboard and overview counts ignore drafts, so they never nag a coach about
  work they have not finished.
- A reader passing `includeDrafts` gets nothing extra; the flag narrows a
  manager's own view, it does not widen a reader's.

---

## ADR-014 — 2026-07-30 — Archive configuration, delete messages, and let absence mean something

**Status:** Accepted

**Context:**
"Delete" means different things for a definition, a record and a message, and
getting it wrong either loses history or leaves rows nobody can act on.

**Decision:**
Three rules:

1. **Configuration archives, never deletes.** Activity types, attendance
   statuses, member field definitions and tracking definitions get an `archived`
   flag. The records made under them survive: retiring "Grönt kort 2025" stops
   the asking, it does not forget who had one. Archived definitions are hidden
   from the pickers but still resolve for display.
2. **Domain records are cancelled, not removed.** A cancelled activity stays on
   the calendar struck through so nobody turns up at the pitch.
3. **Messages are genuinely deleted.** A post is a message, not a record —
   withdrawing one that was wrong is the point, and an archived announcement
   nobody can see is a row nobody will ever read.

Two supporting mechanisms:

- **Clearing a value deletes its row** rather than writing a falsy one, so
  "nobody has said yet" is representable (DDR-006). A tracking `done` entry only
  ever stores `"true"`.
- **Absence carries meaning where a flag would let two truths disagree.** No rows
  in `post_targets` means the whole team; a boolean "for everyone" alongside a
  target list could contradict it, and then a post would be both team-wide and
  targeted at once.
- Uniqueness on a name is a **partial unique index** `WHERE archived = false`, so
  two live definitions cannot share a name but a retired one never blocks reusing
  its own. Un-archiving re-checks the name.

**Consequences:**
- Handlers turn constraint violations into sentences before the database does
  (DDR-007).
- Value types on a definition are immutable once created: flipping a tick list
  to a date would leave every stored `"true"` meaning nothing.

---

## ADR-015 — 2026-07-30 — Composite pages get one aggregate procedure, and null ≠ empty

**Status:** Accepted

**Context:**
The dashboard shows four features that each already have a page. Calling four
procedures means four round trips that each re-resolve the caller's membership
before doing any work, and a page that arrives as a stack of settling boxes.

**Decision:**
A page that aggregates features gets **one procedure** that gathers every widget
in a single `Promise.all`, and denormalises what it needs (an activity carries
its type's name and colour) so the page needs no second call to label itself.

Every widget field is nullable, and the two empties mean different things:

- **`null`** — the caller may not see this. The widget is **not rendered**.
- **`[]` / `0`** — they may, and there is nothing there yet. The widget renders
  its **empty state**.

That distinction is what lets a parent and a coach share one page without the
parent being shown an empty coach's dashboard.

**Consequences:**
- Adding a widget means one more element in the `Promise.all`, not one more
  request. Verified: the dashboard renders on a single `GET /dashboard`.
- Widgets whose feature has not shipped yet are simply absent from the contract,
  and arrive with it.

---

## ADR-016 — 2026-07-30 — Security-critical rules are pure functions with their own tests

**Status:** Accepted

**Context:**
Two features turn on a single access question, and in both the rest of the
feature is a list and a form. Buried in a query, such a rule is untestable and
easy to widen by accident.

**Decision:**
When a feature's correctness rests on one access decision, that decision is a
**pure function in its own module with its own test file**:

- `callups/linked-members.ts` — a user may answer only for members they are
  linked to; `decideResponder` also decides whether it counts as answering on
  someone's behalf, once, at write time.
- `posts/visibility.ts` — `canSeePost`, plus `viewerGroupIds` which resolves a
  viewer's reachable groups **scoped to the team**, because relying on group ids
  being unguessable would be relying on the wrong thing.

Withholding is expressed as **`NOT_FOUND`, not `FORBIDDEN`**, where the existence
of the record is itself part of what is withheld: a reader must not be able to
tell "no such post" from "not for you". `FORBIDDEN` is used where the record's
existence is not secret and only the action is refused.

**Consequences:**
- These are the highest-value tests in the repo and are written first.
- A handler that needs the rule imports it; it never restates the condition.

---

## ADR-017 — 2026-07-30 — Rich text without an HTML pipeline

**Status:** Accepted

**Context:**
Post bodies (#18) needed formatting. Rendering user-authored markdown as HTML
means a sanitiser, and a sanitiser is a thing to get wrong on content shown to
every family in the team.

**Decision:**
A **small markdown subset parsed to a token tree and rendered as React
elements**. Nothing is ever passed to `dangerouslySetInnerHTML`, so a body
containing `<script>` is text exactly as typed and there is nothing to sanitise.
No dependency is added.

Supported: blank line for a paragraph, single newline for a break, `- ` for a
bullet, `**bold**`, `[text](url)`, and bare `http(s)` URLs. Anything else stays
literal — a body that renders `**` as two asterisks is a small disappointment; a
half-parsed one that swallows a coach's text is worse.

Link hrefs go through an **allowlist of `http:` and `https:`** resolved with
`new URL()`. `javascript:` is the one way a body could otherwise become
executable, and an allowlist cannot be talked around the way a blocklist can. A
refused scheme falls back to the **literal source text**, so the reader still
sees what was written rather than a link that silently lost its target. Links
render with `rel="noreferrer noopener"`.

**Consequences:**
- The parser is pure and tested, including every refused scheme.
- Extending the subset means extending the tokeniser, never reaching for an HTML
  renderer.

---

## ADR-018 — 2026-07-30 — Tailwind v4 theme colours: static lookups, and states that never coexist

**Status:** Accepted

**Context:**
Two traps in Tailwind v4 with a CSS-first theme, both of which have already cost
debugging time:

1. Class names built by interpolation are invisible to the build, so the CSS is
   never emitted.
2. `tailwind-merge` (inside `cn()`) resolves conflicts only for classes it
   recognises. A custom `@theme` colour such as `text-ink` is not in its table,
   so `cn("text-white/85", "text-ink")` keeps **both** and CSS source order
   decides — which is how an active nav pill rendered white-on-white.

**Decision:**
- Design-token classes are **static lookups keyed by token name**, declared as an
  explicit `Record<Token, string>` (`ACTIVITY_COLOUR_DOT`, `ATTENDANCE_TOGGLE`,
  `RESPONSE_DISC`). Never interpolated.
- Mutually exclusive visual states must **never be passed to `cn()` together**.
  For router links this means putting the colours in `activeProps` /
  `inactiveProps` so only one set exists at a time; elsewhere it means a ternary
  choosing one complete class string, not two overlapping ones.
- `--ease-standard` and other values needed as utilities are declared inside
  `@theme`, not only `:root`, or the utility does not exist.

**Consequences:**
- Any new token-driven styling adds a row to a lookup table.
- This will recur with every custom colour added to `@theme`; it is a property of
  the setup, not a one-off bug.

---

## ADR-019 — 2026-07-30 — Write granularity follows the hand using it

**Status:** Accepted

**Context:**
Two grid-shaped screens have opposite needs. Attendance is marked standing at the
side of a pitch on a connection that may not be there. The tracking matrix is
filled in a tick at a time, sometimes by two people at once.

**Decision:**
- **Attendance saves in bulk.** The coach marks the roster and saves once, rather
  than firing a request per tap.
- **Tracking saves one cell per request.** A whole-row save would make two
  coaches working down different columns overwrite each other.

**Consequences:**
- The attendance screen owns a dirty-state buffer; the matrix does not.
- The matrix invalidates and refetches after each cell, which is affordable
  because the payload is small; it disables only the cell in flight.

---

## ADR-020 — 2026-08-02 — Deploy on Render and Neon, split across two hosts

**Status:** Accepted

**Context:**
The app needed somewhere to live, with two constraints: free if at all possible,
and no container pipeline to maintain. The stack forces the issue — the backend
is a long-lived `node:http` server, which rules out anything that only runs
serverless functions without rewriting it.

Free tiers were checked rather than assumed, and several widely-cited ones have
quietly died: Fly.io removed its free allowance in 2024, Railway offers only a
one-off $5 credit, and Koyeb's free service tier is gone (Pro now starts at
$29/month) despite blog posts still listing it. Vercel's Hobby plan forbids
commercial use and would need the backend rewritten. Cloudflare Workers cannot
run `node:http` at all, and `pg` over TCP would need Hyperdrive or Neon's
serverless driver — feasible via oRPC's fetch adapter, but days of work rather
than an afternoon.

**Decision:**
- **Render** hosts both halves as two separate services, declared in
  `render.yaml`: a static site for the SPA and a free web service for the API.
  It builds straight from the GitHub repo with a build and start command, so
  the existing `docker/` setup stays a local-development tool and never becomes
  a deployment dependency.
- **Neon** hosts PostgreSQL, *not* Render's own free database, which is deleted
  30 days after creation.
- The **static site is never merged into the API**. Serving the SPA from Node
  would put both on one origin and avoid the cookie work below, but it would
  drag the frontend down into the API's cold start, lose the CDN, and add file
  serving to a file that is currently a clean API entry point.
- **Migrations run in the API's build command.** Render's pre-deploy hook is
  paid-only, and the alternative — migrating in the start command — would run
  on every wake from sleep and sit on the cold-start path.

**Consequences:**
- The deployment costs nothing, and the only upgrade the project ever needs is
  the API to Starter (~$7/month) to remove the cold start. The static half is
  free permanently regardless.
- **The free API sleeps after 15 minutes idle and takes about a minute to wake.**
  This is accepted, not worked around. Pinging it awake is self-defeating: the
  750 monthly instance hours are pooled per workspace, and exhausting them
  suspends every free web service until the next month.
- **The split hosts made the session cookie cross-site.** `onrender.com` is on
  the Public Suffix List, so the two subdomains are different sites. This was
  first handled with `SameSite=None; Secure`, which works only in browsers that
  still allow third-party cookies — superseded by ADR-021.
- Migrating at build time means a build that migrates and then fails to deploy
  leaves the schema ahead of the code. Migrations must stay compatible with the
  previous release — add columns before using them, drop them a release later.
- `NODE_ENV=production` is set on the service, which makes `npm ci` skip
  devDependencies; the build commands pass `--include=dev` because `typescript`,
  `vite` and `tsx` all live there. Removing that flag breaks the build.

---

## ADR-021 — 2026-08-02 — Proxy the API onto the SPA's origin

**Status:** Accepted (supersedes the cookie handling in ADR-020)

**Context:**
ADR-020 put the SPA and the API on two `onrender.com` subdomains. Because that
domain is on the Public Suffix List, the two are different *sites*, so the
session cookie is third-party from the SPA's point of view and was issued as
`SameSite=None; Secure`.

That attribute only asks the browser to send a third-party cookie; it does not
make it willing to. iOS blocks third-party cookies outright — Safari, Chrome and
Firefox included, since all iOS browsers are WebKit — and desktop Firefox does
the same. Sign-in on a phone therefore appeared to succeed, the redirect landed
back on the app, and every request after it was anonymous, bouncing the user
straight back to `/login`. Desktop Chrome still permits the cookie, so the bug
was invisible in development.

**Decision:**
- **A rewrite rule on the static site proxies `/api/*` to the API service.** The
  browser only ever sees one origin, and the session cookie is first-party.
- The splat drops the prefix (`/api/me` → `/me`), so no backend route knows it
  is proxied and local development is unchanged.
- `VITE_API_URL` becomes the path `/api`, resolved against `location.origin` in
  `lib/api-url.ts` because oRPC's `OpenAPILink` requires an absolute base URL.
- `AUTH_CALLBACK_URL` moves to the web origin's `/api/auth/google/callback`. The
  callback is the response that sets the session cookie, so it has to be served
  from the origin the cookie belongs to.
- `serializeCookie` drops the conditional and always emits `SameSite=Lax`.

**Alternatives considered:**
- **A custom domain** with the SPA and API on sibling subdomains of one apex.
  Equally correct and one moving part fewer, but it requires owning a domain;
  the proxy needs nothing.
- **Bearer tokens in `localStorage`.** Sidesteps cookie policy entirely, but
  trades an HTTP-only cookie for a token any XSS can read.
- **Serving the SPA from the API**, rejected in ADR-020 for dragging the
  frontend into the API's cold start. Still true; the proxy gets the single
  origin without it, since the static site stays the thing being served.

**Consequences:**
- `SameSite=Lax` restores the CSRF protection `None` had given up.
- API traffic takes an extra hop through Render's CDN. The static site draws no
  instance hours, so this stays free.
- The API's hostname is now committed in `render.yaml` rather than configured.
  If Render suffixes the service name, that rule is what has to change.
- The deployment is verified on a phone, not only on desktop Chrome, which is
  the most permissive browser about cookies and hides this class of bug.

---

## ADR-022 — 2026-08-03 — Store the personnummer, and gate reading it

**Status:** Accepted

**Context:**
The roster's core fields were deliberately kept minimal — name, birth year,
contact — on the assumption that a member is identified by who they obviously
are. Importing a real team from SportAdmin (see
`docs/product/member-import.md`) showed that assumption does not survive
contact with real data:

- A child's e-mail address in the export is usually a parent's, so two siblings
  identify as the same person.
- Names change, and are not unique inside a team to begin with.
- `Medlems Nr`, SportAdmin's own key, was empty for every row sampled.
- Birth year alone is worthless in an age-group team, where every member shares
  it by construction.

The personnummer is the only field in the export that identifies a person
across the club's systems — the roster, the licence register, and every
subsequent re-import. A re-import that cannot tell an existing member from a
new one either duplicates the roster or overwrites the wrong row.

The first design avoided storing it: reduce it to a birth date in the browser
and discard the rest. That preserved nothing to match on, which pushed the
problem into fuzzy name matching — a worse outcome for the people in the
database than storing the number carefully.

Swedish law is specific here rather than merely permissive: 3 kap. 10 §
dataskyddslagen allows processing a personnummer when *clearly justified* with
regard to the purpose. Unambiguous identification of members for registration
and licensing is such a purpose. General convenience is not.

**Decision:**
- **The number lives in its own table, `member_personal_ids`**, one row per
  member at most: `member_id` (primary key), `team_id`, `personal_id`,
  `created_at`. Normalised to twelve digits (`201703142412`), unique on
  `(team_id, personal_id)` — not globally, because the same person is
  legitimately a member of two teams. `team_id` is duplicated here so that
  constraint can exist, and a composite foreign key
  `(member_id, team_id) → members(id, team_id)` keeps the copy honest; that in
  turn adds `UNIQUE (id, team_id)` to `members`.
- **All access goes through `apps/backend/src/members/personal-id.ts`.** Grepping
  the table name yields the complete list of call sites.
- **Validation lives in `@fc-app/contracts` as pure functions with their own
  tests** (ADR-016): length, date validity, and the Luhn check digit. It accepts
  **samordningsnummer** (day + 60) and every input form a human or an export
  produces — `YYYYMMDD-NNNN`, `YYMMDD-NNNN`, `YYMMDD+NNNN`, and the same
  without separators.
- **Reading the full number requires `members.manage`.** `members.view` gets it
  masked (`20170314-****`) in the same field, so no caller has to know which
  shape to expect. The permission check and the masking both live in that one
  module — a leak should require editing it, not merely forgetting to think
  about it (ADR-011: the gate is chosen per question, not per feature).
- **It is never logged** — not in request logging, not in error messages, not in
  the import report. The import preview reports "personnummer changed" without
  showing either value.
- **`birth_date` and `birth_year` are derived from it** when present, and stay
  independently writable for members who have no Swedish number.
- **It is shown on purpose only**: behind a reveal toggle on the member detail
  page for `members.manage`, never in the roster table.

**Alternatives considered:**
- **A `personal_id` column on `members`.** Rejected, and this is the reason the
  table exists. `procedures/members.ts` reads rows with `.selectAll()`; masking
  in `toMember()` protects every path that goes through it, but the next
  aggregate, search endpoint or export that selects a member row and returns it
  directly would carry the number along. A separate table makes that impossible
  by construction: what you did not join, you cannot leak. The cost is a join at
  four call sites.
- **Encrypting the column with `pgcrypto`.** Rejected for now. The key would sit
  in the same environment as `DATABASE_URL`, so it defends against a stolen
  backup and very little else. The separate table makes it addable later without
  touching `members`.
- **Store a hash instead.** Rejected. The keyspace is about 10^11 — a full
  rainbow table is minutes of work on a laptop — so a hash of a personnummer is
  still a personnummer, with the added harm of *looking* protected.
- **Store only the birth date.** Rejected: it is not an identifier. In a
  single-age team it is close to a coin flip between two members.
- **Keep it out of the database and match on names.** Rejected: it moves the
  risk from "a stored identifier needs a read gate" to "the import silently
  merges two children", which is the worse failure.

**Consequences:**
- This is the first field with a read gate stricter than the rest of its
  member's data, and the first stored outside the table it describes. Reading it
  is a deliberate act — a join plus a permission check — which is the point.
- `members` gains `UNIQUE (id, team_id)`, a constraint that exists only to let
  the composite foreign key above be declared.
- Re-importing the same file becomes idempotent, which is the acceptance test
  for the import feature.
- The row is optional and everything must stay usable without it. A member who
  has no Swedish personnummer — a new arrival, a visiting player — is a normal
  case, not an error state.
- The club takes on a data-protection obligation it did not have: the number
  must appear in data-subject exports, and be removed on erasure. Archiving a
  member (ADR-014) keeps the row, so erasure is a separate action — here a
  single-row `DELETE`, which is cleaner than nulling a column.
- No audit log records who revealed a number. For a handful of coaches in one
  team, an access trail is *more* data about people, not less. Worth revisiting
  only if fc-app is used club-wide.
- The product spec's "core fields kept minimal" line now has a documented
  exception, and this ADR is the reason it is one.
