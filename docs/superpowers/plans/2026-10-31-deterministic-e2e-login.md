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

### Task 2: Reconcile release evidence

**Files:**
- Modify: `evidence/checkpoints/acceptance-status.md`
- Modify: `README.md`
- Modify: `evidence/checkpoints/CURRENT_HANDOFF.md`

- [ ] Record exact historical run #22 failure at commit `9a5cce31e7bdd96c029fb1442afafaa21843b6ee`: 23/24 browser checks passed; the failing case was the narrow-viewport ticket queue test and its shared login helper remained on `/sign-in`. Do not claim CI proved the limiter caused the login failure.
- [ ] Record the confirmed mechanism separately: 19 direct shared E2E helper logins plus auth-flow logins share one API process/IP; production cap is 20; test isolation is the selected correction.
- [ ] Push the reviewed local commit and obtain a new exact-head CI run; record its URL, SHA, result and test counts here and in the ledger. Local checks are not a substitute.
- [ ] Preserve existing security, Preview, Docker, accessibility, migration, and independent-review blockers. Do not change deployment or merge state.
