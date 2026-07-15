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
