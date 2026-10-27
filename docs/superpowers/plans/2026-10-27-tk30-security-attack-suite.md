# TK-30 Security Attack Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Add focused real-PostgreSQL/API attack regressions for cross-route CSRF/origin enforcement, role escalation, and unsafe property payloads, while accurately reusing existing A31–A33 evidence.

**Architecture:** Add one isolated Vitest integration suite at `api/tests/security/attack-suite.test.ts`, using the established disposable-database fixture pattern and one synthetic Alpha/Beta fixture. The suite will exercise the shared authentication middleware through all existing cookie-authenticated write routes and strict input parsing through a comment/property attack. It will not duplicate already comprehensive login-throttle and safe-error tests, nor change production code unless an attack assertion exposes a real vulnerability.

**Tech Stack:** TypeScript, Vitest, Supertest, Prisma PostgreSQL adapter, disposable `support_test` database.

**Spec:** `harness/SECURITY_CONTRACT.md`; `harness/ACCEPTANCE_MATRIX.md` A03, A05, A06, A08, A31–A33; `harness/IMPLEMENTATION_TASKS.md` TK-30; approved security boundaries in `docs/superpowers/specs/2026-10-26-customer-support-design.md`.

## Global Constraints

- Verify `support_test` with `node scripts/verify-test-database.mjs` before every database-backed test command.
- Use synthetic identities and a test-only secret; never place `.env` values, cookies, tokens, or hashes in evidence.
- No production DB, deployment, paid resources, push, merge, reset, or cleanup.
- Preserve the current strict Zod allowlists and authentication/authorization middleware; production changes require a reproduced failing attack and regression-led fix.
- Keep A31–A33 and G5 `NOT_RUN` unless their full acceptance criteria are proven.

## Existing coverage and gap ruling

- A31 has route tests for ticket create/update and membership create/update allowlists; comments reject unknown fields but lack explicit actor/ORM-field and prototype-key attack evidence. Extend coverage for the comment write surface and JSON prototype-pollution keys.
- A32 has login/logout and ticket-create CSRF cases. `createAuthenticate` is shared across all authenticated routes, but no single integration test enumerates all current write routes. Add a table-driven attack for absent CSRF proof and hostile Origin on logout, ticket create/update/assignment/comment, and membership create/update.
- A33 already has fake-clock account/IP login throttling including spoofed `X-Forwarded-For` rejection (`api/tests/auth/auth.test.ts`) and safe error/request-ID/secret-redaction checks (`api/tests/http/errors.test.ts`). Preserve those as the evidence source; do not add a duplicate limiter or error suite.
- Membership role denials and active-membership refresh are already covered (`api/tests/memberships/memberships.test.ts`, `api/tests/auth/active-membership.test.ts`). Add one explicit non-admin role-escalation attack in the new route-level suite only if the attack fixture can verify no state change without duplicating the detailed membership matrix.

## Task 1 — Cross-route cookie CSRF/origin attacks

**Files:** Create `api/tests/security/attack-suite.test.ts`.

- Build a small Alpha/Beta fixture with synthetic admin, agent, customer, and foreign admin; authenticate through the real login route, verify disposable DB identity, and seed one Alpha ticket.
- Enumerate each authenticated state-changing route: `POST /api/auth/logout`, `POST /api/tickets`, `PATCH /api/tickets/:id`, `PATCH /api/tickets/:id/assignment`, `POST /api/tickets/:id/comments`, `POST /api/memberships`, and `PATCH /api/memberships/:userId`.
- For every route, send one request with the valid cookie and allowed Origin but no CSRF token, and one with the valid cookie/token but attacker Origin. Use valid payloads, organization selectors, and `If-Match` where otherwise required so middleware is the rejection point.
- Assert `403` plus `CSRF_REJECTED`; snapshot ticket, comment, event, and membership state and assert no mutation after the matrix.
- Run `node scripts/verify-test-database.mjs && npm run test:api -- tests/security/attack-suite.test.ts`.
- Expected: all enumerated attacks reject before writes; successful E2E/product routes stay unchanged.

- [x] Build a disposable-DB guarded Alpha/Beta fixture with Admin, Agent, and Customer sessions plus one synthetic ticket.
- [x] Add a table-driven missing-CSRF/hostile-Origin attack for all seven existing authenticated mutation routes; assert denial, request ID, and unchanged DB snapshot.
- [x] Run the guarded focused suite; 14 CSRF/origin cases passed.

## Task 2 — Property and role-escalation attacks

**Files:** Continue `api/tests/security/attack-suite.test.ts`.

- Send raw JSON to comment creation with `authorUserId`, `createdBy`, `organizationId`, `__proto__`, and `constructor.prototype` properties. Expect the strict allowlist to return `422 VALIDATION_ERROR`, no comment/event writes, and no global prototype mutation.
- Have an authenticated non-admin attempt membership creation with a forged administrator role; expect `403 FORBIDDEN` and an unchanged membership snapshot.
- If either test exposes a defect, stop, record the reproduced result, add/observe the failing regression first, then make the smallest production fix and rerun the focused attack case before the suite.
- Expected on current implementation: attacks return denial/validation errors with no state change; no source implementation changes should be necessary.

- [x] Add a real-JSON comment payload with forged actor/tenant fields and `__proto__` / `constructor.prototype`; verify strict rejection, no DB writes, and no `Object.prototype` mutation.
- [x] Add a non-admin self-promotion attempt against membership administration; verify `403 FORBIDDEN` and unchanged membership state.
- [x] Run the focused suite; both attack assertions passed against existing protections. This task adds verification only; no production defect was observed.

## Task 3 — Verification and checkpoint evidence

**Files:** `evidence/checkpoints/TK-30.md`, `evidence/reviews/tk30-<date>-<sha>.md`, `evidence/checkpoints/acceptance-status.md`, `evidence/checkpoints/CURRENT_HANDOFF.md`.

- Reverify disposable DB identity and run the new focused suite.
- Run `node scripts/verify-test-database.mjs && npm run check`, `py -3 scripts/check-doc-contract.py`, and `git diff --check`; record actual output/counts.
- Review exact committed source using the parent-folder `100xdevs_assessment_review_agent_skill` integration prompt. That parent folder provides an integration note and reviewer prompt, while the repo-local reviewer skill is absent; disclose that fallback in reviewer evidence.
- Map the new cross-route and property evidence to A31/A32 and preserve existing A33 test evidence; do not claim G5, because CI, Docker release, and full security hardening criteria remain outstanding.

- [x] Run guarded focused attack suite: 16/16 passed.
- [x] Run guarded `npm run check`: API385/385, web3/3, 23 E2E tests discovered, lint/typecheck/build passed.
- [ ] Run documentation contract and whitespace checks, commit the test-only source and plan, and request exact-SHA parent-folder review.
- [ ] Record reviewer findings and checkpoint evidence; leave A31–A33/G5 pending unless the whole matrix is established.

**Commit:** `test(security): add cross-route attack coverage` for the verified test source, then a separate evidence commit after exact-SHA review.
