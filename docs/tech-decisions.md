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
