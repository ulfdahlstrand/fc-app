# FC App

Administration app for football teams — roster, calendar, attendance,
match call-ups, and team communication. Built around **flexibility**: teams
configure member fields, activity types, attendance statuses, roles, and
tracking lists to fit how they work.

- **Product specification** (pages & features): [`docs/product/product-spec.md`](docs/product/product-spec.md)
- **Architecture**: [`docs/architecture.md`](docs/architecture.md)
- **Technical decisions (ADRs)**: [`docs/tech-decisions.md`](docs/tech-decisions.md)
- **Deployment** (Render + Neon): [`docs/deployment.md`](docs/deployment.md)

## Stack

Turborepo monorepo, strict TypeScript throughout (foundation adopted from
`project-enigma`, see ADR-001):

- `apps/frontend` — React 19 + Vite, Material UI, TanStack Router/Query, react-i18next (sv/en)
- `apps/backend` — Node.js, oRPC (contract-first, OpenAPI handler), Kysely, PostgreSQL
- `packages/contracts` — shared oRPC contract + Zod schemas (typed end-to-end, no codegen)
- `packages/tsconfig` — shared strict TypeScript base configs

## Getting started

```bash
cp .env.example .env
npm install

# Everything in Docker (db + migrations + backend + frontend):
npm run docker:up
```

### Hybrid: database in Docker, apps on the host (recommended for dev)

```bash
npm run docker:db                 # start only PostgreSQL (host port 5433)
npm run migrate -w apps/backend   # apply migrations
npm run dev                       # contracts (watch) + backend + frontend
```

The root `.env` is shared by everything running on the host: the backend
reads it via `--env-file`, Vite reads it via `envDir`, and its DATABASE_URL
points at `localhost:5433`. Containers build their own in-network URL
(`db:5432`) in `docker-compose.yml`.

Frontend: http://localhost:4173 — Backend: http://localhost:4001 (OpenAPI spec at `/openapi.json`).
PostgreSQL is exposed on host port 5433. Ports are offset from project-enigma's
defaults (5173/3001/5432) so both projects can run side by side.

## Common commands

```bash
npm run build       # build all workspaces (turbo)
npm run typecheck   # strict TS check, all workspaces
npm run lint        # eslint (frontend)
npm run migrate -w apps/backend   # run pending Kysely migrations
```
