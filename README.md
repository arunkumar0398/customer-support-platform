# Multi-Tenant Customer Support Platform

A small, organization-aware support workflow for customers, agents, and
administrators. The application uses a React/Vite web client, an Express API,
Prisma, and PostgreSQL.

## Requirements

- Node.js 24 and npm 11
- Git
- Docker Desktop with Docker Compose v2

## Quick start

Run from the repository root in PowerShell. Configure local values in .env
as described in [Local operations](docs/operations.md); do not commit .env.
The seed is guarded to write only to the loopback support_dev database and
creates synthetic data.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm ci
docker compose up -d --wait database
npm run db:migrate
npm run db:seed
docker compose up -d --build --wait api web
```

Open http://localhost:8080. Environment values, health checks, hot reload,
and troubleshooting are in [Local operations](docs/operations.md).

## Tests

```powershell
npm run db:migrate:test
npm run db:verify-test
npm run check
npm run test:e2e
py -3 scripts/check-doc-contract.py
```

The check command runs lint, type checking, API and web tests, Playwright
test discovery, and builds. Discovery does not execute browser tests; run
test:e2e for those. The browser suite uses the guarded disposable support_test
database and may require Chromium. See [Testing and CI evidence](docs/testing.md).

## Synthetic demo data

The seed creates synthetic Alpha and Beta organizations with admin, agent, and
customer accounts. The shared password and account list in
[Demo accounts](docs/demo-accounts.md) are local-only; never use them in
Preview or Production.

## Documentation

- [Architecture and request flow](docs/architecture.md)
- [Data model, constraints, and indexes](docs/data-model.md)
- [API routes and examples](docs/api.md)
- [Local operations and Docker](docs/operations.md)
- [Testing commands and results](docs/testing.md)
- [Limitations and next steps](docs/limitations.md)
- [Section 8 deliverables](evidence/checkpoints/DELIVERABLES_INVENTORY.md)
- [Acceptance ledger](evidence/checkpoints/acceptance-status.md)
- [Current handoff](evidence/checkpoints/CURRENT_HANDOFF.md)
- [Archived status snapshots](evidence/history/2026-11-02/README.md)

## Assessment status

The Section 8 snapshot is based on default branch codex/assessment-mvp at SHA
19246132f22bd0e37b6a6a0b9286bb1621d3bad1; Actions #130 passed on that SHA.
The inventory lists the eight required items. Preview A35, the incomplete
security audit, full UI/accessibility review, manual screen-reader review,
evaluator access, and A28 remain separate internal gates. See the
[inventory](evidence/checkpoints/DELIVERABLES_INVENTORY.md) and
[readiness report](evidence/reviews/assessment-readiness-19246132-2026-11-02.md).
