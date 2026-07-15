# FC App

Administration app for football teams — roster, calendar, attendance,
match call-ups, and team communication. Built around **flexibility**: teams
configure member fields, activity types, attendance statuses, roles, and
tracking lists to fit how they work.

- **Product specification** (pages & features): [`docs/product/product-spec.md`](docs/product/product-spec.md)
- **Architecture**: [`docs/architecture.md`](docs/architecture.md)
- **Technical decisions (ADRs)**: [`docs/tech-decisions.md`](docs/tech-decisions.md)

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

# …or run the apps directly (requires a local PostgreSQL, see .env.example):
npm run dev
```

Frontend: http://localhost:5173 — Backend: http://localhost:3001 (OpenAPI spec at `/openapi.json`).

## Common commands

```bash
npm run build       # build all workspaces (turbo)
npm run typecheck   # strict TS check, all workspaces
npm run lint        # eslint (frontend)
npm run migrate -w apps/backend   # run pending Kysely migrations
```
