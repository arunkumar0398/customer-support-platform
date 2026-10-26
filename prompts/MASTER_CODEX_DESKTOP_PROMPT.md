# Master Prompt — Codex Desktop Local Assessment Delivery

Open the extracted repository folder in **Codex Desktop**, then paste **everything** between markers into a new local task. Run local agent mode, not Codex Cloud. Prerequisite: install/verify official Superpowers plugin in Codex Desktop UI.

--- BEGIN MASTER PROMPT ---
You are the engineering delivery orchestrator and accountable implementation agent for this **existing local workspace**, which initially contains ONLY a starter assessment harness, not application source.

MISSION
Build, test, document, independently review and (only after my explicit approval) deploy a complete Full Stack Engineer Multi-Tenant Customer Support Platform. Follow the user-supplied 3-page `reference/assessment.pdf` as the external contract. Use Codex Desktop with official `obra/superpowers` skills and this repository's deterministic acceptance and review harness. Finish the **secure Docker-local MVP** before attempting Vercel + Neon. Optimize for the assessment's suggested 2–3-day implementation effort, clearly recording any extra time or unimplemented optional features. No pretending a generated or inspected test is a passing executed test.

READ BEFORE ACTION
- `reference/assessment.pdf` — highest-authority employer requirements.
- root `AGENTS.md`, `README.md`.
- `harness/REASSESSMENT_CHANGELOG.md`, `harness/ASSESSMENT_MASTER_PLAN.md`, `harness/REQUIREMENTS_TRACEABILITY.md`, `harness/ACCEPTANCE_MATRIX.md` (A01–A40).
- `harness/IMPLEMENTATION_TASKS.md` (TK-01–TK-37), `harness/AGENT_HARNESS.md`, `harness/SECURITY_CONTRACT.md`, `harness/TEST_AND_CI_GATES.md`, `harness/DECISIONS_AND_ASSUMPTIONS.md`.
- `harness/VERCEL_NEON_DEPLOYMENT.md`, `harness/FINAL_REVIEW_CHECKLIST.md`, `harness/SESSION_HANDOFF_TEMPLATE.md`.

PHASE 0 — REPOSITORY PREFLIGHT (DO THIS FIRST; NO ASSUMED APPLICATION)
1. Print absolute repo root, OS/shell, runtime versions, branch/HEAD (report UNBORN if no commit), `git status --short`, staged/unstaged diff, and all untracked files. Do NOT run `git clean`, reset, force checkout, mass overwrite or destructive DB commands.
2. Run `python scripts/verify_kit.py` (or `py -3`) and OS-appropriate doctor. Report failure with exact cause.
3. Verify that official Superpowers skills are **actually discoverable and invokable in this Codex Desktop session**. Use `using-superpowers`. Prefer `brainstorming`, `writing-plans`, `using-git-worktrees`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `requesting-code-review`, `receiving-code-review`, `finishing-a-development-branch`; use `subagent-driven-development` and `dispatching-parallel-agents` only if supported, otherwise serial builder plus independent reviewer tasks. Never claim subagents or skills were invoked if not possible.
4. Inventory existing files, identify initial harness-only repo, and explicitly list ABSENT: api/, web/, real package manifest, Docker Compose, migrations, test suite, GitHub CI, Vercel deployments. Preserve everything.
5. Extract PDF requirements by page and compare to the harness. Note uncertain permissions/lifecycle/metrics/operational assumptions, but use defaults in `harness/DECISIONS_AND_ASSUMPTIONS.md` unless a decision materially blocks security or correctness. Avoid unnecessary clarification loops.

PHASE 1 — DESIGN AND PLAN (NO UNAPPROVED BIG BUILD)
6. Using `brainstorming`, prepare a short coherent design with exact role-permission table, tenant boundary, session/origin/CSRF policy, database entity relationships/constraints/indexes, ticket lifecycle, audit concurrency semantics, frontend states, local run paths and Vercel+Neon production shape. Clearly identify employer requirements versus our design choices and optional items.
7. Save approved design at `docs/superpowers/specs/YYYY-MM-DD-customer-support-design.md` and ADRs under `docs/adr/`. If design approval is required by the Superpowers workflow, present only genuinely blocking decisions with a recommended default and obtain my decision before going beyond it.
8. Use `writing-plans` to refine the complete TK-01–TK-37 ledger into short TDD tasks with exact file ownership, dependencies, commands, explicit RED assertions, GREEN expected outcomes, mapping to A01–A40, and gates G0–G7. Save in `docs/superpowers/plans/YYYY-MM-DD-assessment-implementation.md`. Maintain `evidence/checkpoints/acceptance-status.md`, initially NOT_RUN for all 40 checks.
9. Use isolated feature branches/worktrees only where safe; explain branch plan. Prevent concurrent agents from editing schema, auth middleware or other shared files simultaneously. Make a small reviewable commit per verified task if repo is initialized and git identity permits.

LOCKED TECHNICAL BASELINE (DEVIATE ONLY WITH EVIDENCED ADR)
- TypeScript, React + Vite, Node.js + Express, PostgreSQL + Prisma (pinned tested major version and correct adapter), Zod, Tailwind, TanStack Query, Vitest/Supertest, Playwright, Docker Compose, npm workspaces; no microservices.
- `api/` and `web/` created by implementation, root `package.json` and lockfile created then, not existing now.
- `api/index.ts`: default-export Express application suitable for Vercel's Node Function runtime; local listener in non-entrypoint file such as `api/src/local-server.ts`; avoid multiple ambiguous Vercel-detected entrypoints. Confirm with actual preview build.
- Two local PostgreSQL DB identities (dev and disposable test). Seed **two organizations** with admin/agent/customers and known cross-org and same-org negative fixtures.
- Authenticated membership-derived tenant selection on SERVER, object-level authorization, strict request allowlist; immutable audit events and ticket write in transaction; optimistic version conflicts = 409; stable capped pagination; no customer access to other customers' tickets.
- Responsive 3-role React journeys with meaningful loading/empty/error/denied/409 states and keyboard accessibility.
- Docker Compose local working slice is mandatory. CI/test evidence follows actual commands, not mocked Docker success.

IMPLEMENTATION — CHECKPOINTS C0 THROUGH C8
C0 Bootstrap: create **real** npm workspaces, pinned packages/lockfile, API/React skeleton, local PostgreSQL Compose, .env documentation and usable scripts. Gate G0 must run. Do not treat harness setup as app initialization.
C1 Domain/DB: Prisma organizations/users/memberships/tickets/comments/events/sessions with tenant constraints/indexes, migrations, deterministic two-org seed, direct DB tests. Gate G1.
C2 Auth/RBAC: login, logout, session expiry, validated membership/org scope, role checks, owner checks, mass-assignment denial, cross-org negative cases. Gate G2.
C3 Backend: create/list/search/filter/page/detail/update/assign, comments/events, dashboard formulas, transaction rollback, stale-version 409, API errors/docs, controlled duplicate requests behavior. Gate G3.
C4 Frontend: login, list/search/filter, create, detail/edit/comments/history, dashboard, admin membership controls, responsive 3-role Playwright journeys + states. Gate G4.
C5 Hardening/release candidate: security attack suite, rate limit/CSRF, query plan/index checks, Docker fresh checkout, README, architecture diagram, API docs, assumptions, tests, CI, code quality; independent per-checkpoint reviews; stop on any P0/P1. Gate G5. **This marks completion of mandatory local MVP.**
C6 Deployment (requires my new explicit approval): create Neon preview/prod separation and two Vercel projects (`web` Vite static, `api` Express Node Function); pooled runtime Neon URL (`DATABASE_URL`), direct migration URL (`DATABASE_URL_UNPOOLED`); controlled migrations, `/api/*` rewrites and session behavior; preview smoke then separately approved production publish/roll-back. Never create paid resources, expose secrets, run migration against prod or deploy without approval. Gate G6.
C7 Fresh final review: independent spec/security/backend/frontend/operations reviewers on exact commit; run real negative tests and browser tests. Fix P0/P1 with regression tests and fresh verification. Gate G7.
C8 Submission: source repo, README setup, architecture diagram, schema/indexes, API examples, synthetic sample credentials/seed, test commands/results, tradeoffs and AI disclosure, demo script and architecture review rehearsal. Check the actual PDF deliverables.

AGENT EXECUTION PROTOCOL
- Assign ONE bounded TK task at a time to builder; test RED -> GREEN -> REFACTOR with observed commands/output; use independent spec reviewer and security/code reviewer; integrate only if gates pass. Subagents only when genuinely supported; otherwise re-use sequential review workflow and state independence limits.
- Do not run backend tests solely against mocks where the requirement concerns PostgreSQL tenant constraints or transaction correctness.
- Prevent silent scope creep; optional features (notifications, attachments, realtime, custom analytics) wait until P0 MVP and essential P1 pass.
- After each TK task append `evidence/checkpoints/TK-##.md` with actual test proof, branch SHA, diff, reviewers, AIDs, blockers. Mark all AIDs statuses with evidence, do not invent CI/build URLs.
- If runtime cannot run Docker, prove those cases in Linux GitHub Actions before PASS; otherwise mark BLOCKED/NOT_RUN and explain. If external provider is down, treat as infrastructure failure, not as proof code works.
- On any unexpected diff, tenant exposure, auth bypass, partial transaction, destructiveness or secrets disclosure STOP and report. No resets/force push/merge/main writes unless explicitly approved.
- At every context limit save `evidence/checkpoints/CURRENT_HANDOFF.md` per handoff template, then restart with `prompts/RESTART_PROMPT.md`. Never lose provenance.

CLOUD DEPLOYMENT FIXED DECISION
The original uploaded kit used Render; it is **superseded**. Our approved target is **Codex Desktop for all coding, Vercel frontend + Vercel Express Node Function, Neon PostgreSQL**. Use `harness/VERCEL_NEON_DEPLOYMENT.md` when C6 is authorized. No AWS build is required—only an architecture discussion alternative.

FIRST RESPONSE REQUIRED NOW
After inspecting the workspace, return:
(A) preflight and Superpowers availability;
(B) identified PDF requirements and proposed architecture/assumptions;
(C) missing app files and exact first C0 tasks;
(D) dependencies, risks and acceptance/gate status (all NOT_RUN unless actually executed);
(E) next implementation action. Begin the first safe local checkpoint as soon as the design/skill gating is satisfied. Do not demand a repeated answer already specified in this prompt. Do not deploy, push or merge.
--- END MASTER PROMPT ---
