# Repository-wide Instructions — Codex Desktop

This file applies from the very first task in a bare/empty repository. Do not assume an application exists.

## Hierarchy
1. `reference/assessment.pdf` is the external assessment contract.
2. `AGENTS.md` sets operating and safety rules.
3. `harness/ASSESSMENT_MASTER_PLAN.md`, `harness/ACCEPTANCE_MATRIX.md`, `harness/REQUIREMENTS_TRACEABILITY.md`, `harness/IMPLEMENTATION_TASKS.md`, `harness/SECURITY_CONTRACT.md`, `harness/TEST_AND_CI_GATES.md`, `harness/VERCEL_NEON_DEPLOYMENT.md` are **proposals** and should not override the PDF.
4. The approved design and incremental `docs/superpowers/plans/` are implementation instructions; mark all deviations explicitly.

## Before any write
- Report repo root, OS, branch, HEAD (`UNBORN` if no commit), working tree, staged/unstaged diffs and untracked files. Preserve every existing file.
- Inspect the PDF and all harness documents; distinguish required, optional, assumptions and not yet implemented.
- Verify Superpowers is actually available in the running Codex harness. Use installed relevant skills according to instructions. If unavailable, disclose and use a documented sequential fallback; never claim a skill was used when it was not.
- Use `brainstorming` for necessary design choices; record an approval gate and then `writing-plans` for narrow executable tasks with explicit tests and files.

## Local implementation mandate
- Create `api/`, `web/`, `docker-compose.yml`, workspace manifest, real package scripts, migrations, tests and CI as **work**, not placeholders marked complete.
- Use a modular monolith, TypeScript React/Vite and Node/Express, Prisma + PostgreSQL, local Docker Compose, seeded two-org fixtures.
- RED → GREEN → REFACTOR. Save exact test command/output and exit code; independently review the resulting diff. Use worktrees or serial task branches, preserving local changes.
- Do not run reset/clean/force operations, destructive database commands, remote push, merge, deployment or paid resource creation without explicit approval. Local seed/reset is allowed only against **identified disposable test databases**.
- Avoid adding optional notifications, sockets, redis, attachments or infrastructure beyond assessment scope while any required gate fails.

## Security invariants
- Authenticate and check **current** membership before selecting active organization; client-provided IDs are selectors, never authority.
- Every org-owned DB read/write must use authorized `organizationId` + role/ownership policy; filter counts, search, dashboard, comments, events and assignments as well.
- Cross-organization and same-organization-other-customer denials must have integration tests; never expose existence via errors/counts.
- Validate payload allowlists, constrain cross-org foreign keys, write tickets plus audit events atomically, detect stale versions with 409, and verify all of them with real DB integration tests.
- Sessions use secure HTTP-only cookies; implement tested CSRF/origin protection, logout/expiry, password hashing, rate-limited login and secret-safe logs.
- Use only synthetic customers and mock ticket content. Never expose database passwords, auth cookies or private data in Git, screenshots, traces or responses.

## Deployment contract
- **Codex Desktop/local first.** Deployment only after G0–G5 pass and explicit human approval.
- Two Vercel projects (`web/` frontend, `api/` Express Node.js Function) and distinct Neon preview + production DB/branches.
- Runtime uses Neon pooled URL; controlled Prisma migration uses direct/unpooled URL; never run migration from HTTP request or every serverless instance.
- `api/index.ts` must export the app default (with a separate local listener). Verify actual Vercel auto-detection and avoid multiple ambiguous app entrypoints.
- Test rewrites, 3-role live flows, cookies, 404/SPA fallback, tenant denials, version conflict, logs and exact deployed SHA.
- No automatic destructive migration, branch reset, provision, production publish or secrets readback.

## Reporting and stop rules
- State `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN` for every required check; never conflate code inspection with test success.
- Per task: `evidence/checkpoints/TK-XX.md`; per final review: `evidence/reviews/*`; deploy: `evidence/releases/*` (sanitized only).
- Stop the line on tenant escape, auth bypass, unexplained lost updates, destructive commands outside test DB, secrets leak or overwritten user work.
- All report claims need exact branch/SHA, real commands, output, reviewer finding and limitations. Context resets require `harness/SESSION_HANDOFF_TEMPLATE.md`.
- Never claim paid deployment or Git operations are complete unless verified. Prefer a smaller correct local MVP to an unreliable incomplete deployment.
