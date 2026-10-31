# Deterministic E2E Login Budget Implementation Plan

> **For agentic workers:** Execute this plan inline with the Superpowers executing-plans workflow. Keep production login throttling unchanged.

**Goal:** Make the complete Playwright suite pass deterministically without raising or disabling production login limits.

**Architecture:** Preserve the production IP cap at 20 attempts per 15 minutes and account cap at 5. Add an explicit optional API-factory override for the IP cap, used only by the guarded Playwright server. Existing auth integration tests continue to assert the production defaults; a focused test proves the override behaves as configured. Update checkpoint evidence only after fresh verification.

**Tech Stack:** TypeScript, Express, Vitest, Playwright, PostgreSQL disposable database.

## Global Constraints

- Production default remains 20 attempts per IP and 5 attempts per account in a 15-minute window.
- Browser tests run only against the guarded disposable `support_test` database.
- Preserve the ten already-modified TK-29 screenshot PNGs; do not stage or regenerate them during local verification.
- Do not merge, deploy, or modify hosted/Preview/Production data as part of local implementation. The user has now explicitly requested a new exact-SHA GitHub Actions run, which requires committing and pushing this branch after review and local verification.

---

### Task 1: Isolate browser-suite IP budget

**Files:**
- Modify: `api/src/modules/auth/session.ts`
- Modify: `api/src/modules/auth/routes.ts`
- Modify: `api/tests/e2e-server.ts`
- Test: `api/tests/auth/auth.test.ts`

**Interfaces:**
- `AuthOptions.loginIpAttemptLimit?: number`; omitted means the current production default of 20.
- The test-only E2E server creates the app with a larger deterministic IP budget; production entrypoints continue using `createApp()` without an override.

- [x] Add a focused auth integration test using an explicit low override and unique invalid accounts. Verify the configured IP cap gives 401 for exactly the allowed requests and 429 with Retry-After on the next request.
- [ ] RED phase was not re-executed during this review; do not claim a fresh test-first failure here.
- [x] Add the optional setting to `AuthOptions`, default it to 20 in the throttle, and pass a fixed E2E-only value (100) when constructing the guarded browser app.
- [x] Run full auth integration suite; 33/33 passed, including explicit override, default-20 and per-account cases.
- [x] Run full combined Playwright suite against isolated `support_test`; 24/24 passed. The suite modified the ten tracked screenshot assets; originals were restored and SHA-256 verified.
- [x] Run `npm run check`; exit 0, 395 API tests, 12 web tests, 24 E2E cases discovered, lint, typecheck and both builds.
- [x] Commit and push the reviewed correction as `40bcce88e35df94893f8680c2fa9e10192ec4bd7` after the user requested exact-SHA CI.
- [x] Exact-head GitHub Actions [run #23](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41172278881) passed on `40bcce8`: disposable DB migration/seed, 395 API tests, 12 Web tests, combined Playwright 24/24, lint/typecheck/build.

### Task 2: Reconcile release evidence

**Files:**
- Modify: `evidence/checkpoints/acceptance-status.md`
- Modify: `README.md`
- Modify: `evidence/checkpoints/CURRENT_HANDOFF.md`

- [x] Record historical run #22 failure at `9a5cce31e7bdd96c029fb1442afafaa21843b6ee`: 23/24 browser checks passed; the narrow-viewport queue test's login helper remained on `/sign-in`. The run did not expose an HTTP status and does not prove limiter causality.
- [x] Record exact-head run #23 separately from local checks. Local run: combined Playwright 24/24 and full `npm run check` exit 0; GitHub Actions is the exact committed-SHA evidence.
- [x] Preserve the existing A35/A36/A37/Docker/final-review blockers in the current handoff and ledger. The user subsequently directed Preview acceptance testing; those synthetic Preview checks are recorded in [Preview validation](../../evidence/reviews/preview-validation-2026-10-31.md). No Production data or deployment was changed.


## Final exact-candidate verification — 2026-10-31

- Final application source candidate: `7c2fdba6efb7c39dbf723f100644a5c53928fd84`. Local source verification recorded in `evidence/reviews/hallmark-2026-10-31/REVIEW.md`: combined Playwright 25/25; `npm run check` exit 0 with 395 API tests, 12 Web tests, 25 E2E cases discovered, lint, typecheck, and both builds. The screenshot-preservation runner reported no changed screenshots and preserved hashes.
- Exact-SHA GitHub Actions run [#25](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41177630515) checked out this full SHA and its `verify` job concluded `success`; disposable database setup and required gates completed.
- The evidence-only branch-head `858ee91f10295611ee819e2d81219f39e0bc6178` also passed exact-SHA run [#28](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41183097517), including the combined browser suite and all required workflow steps; Vercel Web/API checks succeeded. The application source remained unchanged at `7c2fdba`.
- Rate-limit contract remains unchanged in production: 20 attempts per IP and 5 per account in 15 minutes. Only `api/tests/e2e-server.ts` supplies the fixed 100-attempt IP override; deployed entrypoints omit it. The override test and the default/account-limit cases are in the passing API suite.
- The test-first RED phase was not re-executed during the latest reconciliation and remains explicitly unclaimed.
- Task 2 reconciliation now records historical run #22 on `9a5cce3` separately from current run #25 and local evidence. Ten modified TK-29 screenshots remain preserved and unstaged.
- Remaining release gates: A35 Preview role/foreign-object coverage is blocked; A36 rollback compatibility is not run; A37 is partial; Cloudflare audit cannot run without its required OS-enforced isolated sandbox; and final whole-project independent review remains pending. See the latest acceptance ledger and handoff for the current status.
