# Reassessment of the Uploaded Original Harness — 2026-10-26

Reviewed user-supplied `support_assessment_superpowers_harness_kit(1).zip`: 9 files, including `reference/assessment.pdf`, `README_FIRST.md`, `AGENTS.md`, `AGENT_HARNESS.md`, `ASSESSMENT_MASTER_PLAN.md`, `ACCEPTANCE_MATRIX.md`, `IMPLEMENTATION_TASKS.md`, `FINAL_REVIEW_CHECKLIST.md`, and `CODEX_START_PROMPT.md`.

## Kept and preserved
- The original three-page PDF (byte-for-byte copied).
- Coverage IDs A01–A40, priority scheme, and test expectations (no item removed).
- Task IDs TK-01–TK-37 and dependency-led implementation (deployment task titles corrected).
- C0–C8 checkpoints, TDD + evidence + independent review discipline, strict tenant isolation requirements.
- Explicit optional nature of live deployment under the PDF, and requirement to disclose AI-generated/reused code.

## Corrections made
1. Original zip nested all documents under `support_assessment_harness_plan`; this kit is **root-ready** so Codex reads root `AGENTS.md` immediately.
2. Old deployment references to Render single-service hosting and `render.yaml` removed/replaced with two Vercel monorepo projects and Neon PostgreSQL. No code is yet generated.
3. `harness/VERCEL_NEON_DEPLOYMENT.md` fixes function entrypoint semantics, pooled vs unpooled connections, preview isolation, migration sequencing, cookies/rewrites, and release SHA verification.
4. New master prompt supports an **empty repository and an unborn Git HEAD**, and prevents tool-availability hallucinations.
5. Added initial kit manifest verification; safe Windows doctor; source-to-acceptance trace; security invariants; gate definitions; restart/review/deploy prompts.
6. Aligned evidence locations under `evidence/`, and placed generated specs/plans under `docs/superpowers/`.
7. Added explicit human approval barriers for Git remote writes, Neon/Vercel provisioning, secrets, production migrations and deployment.

## Source vs proposed design
The PDF specifies React, Node Express/Nest, PostgreSQL or MongoDB, secure multi-tenant CRUD, tests, Docker, cloud discussion, and optional live hosting. **React/Vite, Express, Prisma, Neon and Vercel** are our selected implementation choices, not employer-mandated technologies. Some more stringent tests (optimistic concurrency, CSRF and idempotency if implemented) are engineering decisions to make the review defensible.

## Unfinished by design
No app package.json, functional Docker Compose, Prisma migrations, tests, GitHub workflow or live Vercel project is included. Those are future *deliverables* for Codex Desktop to implement and verify. The kit validator checks **kit integrity only**, not application readiness.
