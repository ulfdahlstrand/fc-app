# Architecture

## Overview

**FC App** is a web-based administration app for football teams (see
[`product/product-spec.md`](./product/product-spec.md)). The system is a
Turborepo monorepo containing a React single-page application (frontend), a
Node.js API server (backend), and a PostgreSQL database — orchestrated locally
via Docker Compose.

The technical foundation is adopted from the `project-enigma` codebase
(ADR-001): same monorepo layout, same stack, same conventions.

### Major components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| **Frontend** | `apps/frontend/` | React SPA — routing, data fetching, UI rendering, internationalisation |
| **Backend** | `apps/backend/` | Node.js oRPC server — business logic, input validation, database access |
| **Database** | Docker (PostgreSQL) | Persistent data storage; managed via Kysely migrations |
| **Contracts** | `packages/contracts/` | Shared oRPC router contract and Zod schemas consumed by both frontend and backend |
| **TS Config** | `packages/tsconfig/` | Shared TypeScript configuration extended by all workspaces |

## Tech stack

| Layer | Technology |
|-------|-----------|
| Language | **TypeScript** (strict mode, all workspaces) |
| Monorepo | **Turborepo** + **npm workspaces** |
| Frontend | **React**, **Vite**, **shadcn/ui** + **Tailwind** (ADR-007; Material UI still present during the migration), **TanStack Router** (file-based), **TanStack Query**, **react-hook-form** + Zod resolver, **react-i18next** (sv/en) |
| Backend | **Node.js**, **oRPC** (contract-first, OpenAPI handler), **Kysely** |
| Validation | **Zod** (shared via `@fc-app/contracts`) |
| Database | **PostgreSQL 16**, migrations via **Kysely Migrator** (ADR-006) |
| Auth | OAuth (Google first, Apple later) with backend-managed sessions (ADR-004) |
| Local orchestration | **Docker Compose** (`docker/`) |

## Monorepo structure

```
/
├── apps/
│   ├── frontend/          # @fc-app/frontend — React SPA (Vite)
│   └── backend/           # @fc-app/backend  — Node.js oRPC server
├── packages/
│   ├── tsconfig/          # @fc-app/tsconfig  — Shared TypeScript base configs
│   └── contracts/         # @fc-app/contracts — Shared oRPC contract & Zod schemas
├── docker/
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   └── docker-compose.yml
├── docs/
│   ├── architecture.md    # This file
│   ├── tech-decisions.md  # ADR log
│   └── product/           # Product specification
├── turbo.json
├── package.json           # Root workspace definition (npm workspaces)
└── tsconfig.json          # Root TS config — extends @fc-app/tsconfig base
```

## Key patterns

- **Contract-first API**: every procedure is defined in
  `packages/contracts` (Zod input/output schemas + oRPC contract). The backend
  implements the contract (`implement(contract)`), the frontend consumes a
  fully typed client (`ContractRouterClient<AppRouter>`). No codegen step.
- **Lazy DB client**: `getDb()` initialises the Kysely instance on first use,
  so unit tests importing handlers don't require `DATABASE_URL`.
- **File-based routing**: routes live in `apps/frontend/src/routes/`;
  `src/route-tree.gen.ts` is generated (committed, not hand-edited).
- **Contract-derived forms** (ADR-007): form schemas wrap the contract's write
  fields (e.g. `memberWriteFields`) with the helpers in
  `apps/frontend/src/lib/form.ts`, so client and server validation cannot
  drift. `MemberFormDialog` is the reference implementation.
- **Multi-tenancy** (ADR-003): row-level isolation — all domain tables belong
  to a club (directly or via a parent); every query filters by the caller's
  club context.
- **Configuration as data** (ADR-005): member fields, activity types,
  attendance statuses, roles, and tracking lists are database entities managed
  in the app's settings pages, seeded with defaults on team creation.
