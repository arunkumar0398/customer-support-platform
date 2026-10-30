# Security acceptance replay — 2026-10-30

## Identity and environment

- Repository branch: `codex/preview-mobile-roster-ux`.
- Pushed HEAD before the test-only addition: `ffe7a2a8ab72a92561daded62ca25d8774eaf4d3`.
- Environment: local Windows workspace; real PostgreSQL disposable database `support_test`, role `support_test`.
- `npm run db:verify-test` exited 0 and printed `Verified disposable database identity: support_test / support_test.` before the test runs.
- The test harness creates random Alpha/Beta organizations and users, and cleans its rows/triggers after each suite. No Preview/Production database was used.

## Exact pushed source replay

Command:

`npm run test:api -- tests/tickets/assignment.test.ts tests/tickets/update.test.ts tests/tickets/comments.test.ts tests/tickets/detail.test.ts tests/activity/atomicity.test.ts`

Exit code 0; 5 files, 72 tests passed. The run began 2026-10-30 17:46:34 (Asia/Calcutta).

- Cross-organization ticket update/assignment/comment attempts are denied and leave rows/events unchanged.
- Same-organization customer attempts to read, edit, comment on, and read activity for another customer's ticket are denied without writes.
- Existing PostgreSQL activity-event rejection tests prove ticket update and comment atomicity and successful recovery.

## Assignment atomicity regression added locally

Added one test to `api/tests/tickets/assignment.test.ts` (test-only working-tree diff; SHA-256 `02d2172d5b662693553f57fcf752ec789f08c4e6811bce32bf759202d673b450`). It installs a disposable PostgreSQL trigger that rejects assignment activity events, checks HTTP 500, confirms assignee and version remain unchanged and no event exists, removes the trigger, then verifies a successful retry creates one event and increments version once.

- Focused run: test DB identity verified; assignment suite passed 14/14.
- Full security replay after test addition: the same five suites passed 73/73 (exit 0), began 2026-10-30 17:47:49 (Asia/Calcutta).
- Expected `INTERNAL_ERROR` log records were emitted by the fault-injection cases; the response body did not disclose injected database error text.
- Application source code was not changed. The new regression test remains uncommitted and is not hosted CI evidence.

## Acceptance disposition

- A05 PASS for local real PostgreSQL/API scope at pushed application source; not deployed role/cross-tenant proof.
- A06 PASS for local real PostgreSQL/API scope at pushed application source; not deployed role/cross-tenant proof.
- A16 PASS for local atomicity scope at HEAD plus the uncommitted test-only diff; its new regression must be committed and exact-SHA CI replayed before claiming hosted evidence.
- This artifact does not change A34, A35, A36, G5, G6, or G7 to PASS.

## Replay confirmation — 2026-10-30 19:14 Asia/Calcutta

- Initial check found `.env` `TEST_DATABASE_URL` still on localhost port 5433 while this checkout's Compose database is published on port 15544. No connection succeeded against 5433.
- Re-ran with a process-local port override to the Compose-published port; `npm run db:verify-test` again verified `support_test / support_test` and the five security suites passed 73/73, exit 0. No `.env` edit was made; no database rows outside the tests' disposable fixture transactions were retained.
- This remains local PostgreSQL/API evidence at HEAD `ffe7a2a` plus the uncommitted test-only diff; it is not hosted CI or Preview evidence.
