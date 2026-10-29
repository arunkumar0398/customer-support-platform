# Targeted deployment and concurrency review — 2026-10-29

## Mode and identity

- Reviewer lens: parent 100xdevs-assessment-reviewer deployment/checkpoint method, read-only review of candidate changes.
- Repository: D:/__superset/cactro-tests/_react-node-apps/customer-support-platform/customer-support-platform
- Branch: codex/vercel-api-route-preview
- Base HEAD at review: 620a2282c7f16add9227da44e7672cd00f369d3b; candidate changes are uncommitted and therefore have no candidate SHA.
- Independence: no independent reviewer process was used in this pass; this is a self-review against the parent kit, not independent sign-off.
- Production actions: read-only only. No deployment, push, commit, DB write, or Production config change.

## Evidence reviewed

The parent kit requires observable reproducibility, exact-severity findings, and separation of code/test/deployment evidence. Existing Production evidence records several ticket PATCH responses as HTTP 412 even though changes appeared persisted. Vercel logs corroborated 412 in both API and Web project views, but did not identify the response-generating layer. Therefore the platform/If-Match explanation remains a hypothesis.

Candidate change: ticket update/assignment now require a positive integer X-Ticket-Version; frontend and proxy send/allowlist it; response ETag remains available. Regression coverage rejects missing/invalid/custom-version cases and confirms legacy If-Match alone does not satisfy the contract. See docs/adr/0004-explicit-ticket-version-header.md.

## Executed checks on local disposable PostgreSQL/test configuration

- Before correction, the new successful-write regression failed with 428 when only X-Ticket-Version was sent (7 other concurrency tests passed), confirming the API did not recognize the new contract yet.
- npm run test:api -- tests/tickets/concurrency.test.ts: PASS, 1 file / 8 tests.
- npm run test:api -- tests/tickets/update.test.ts tests/tickets/assignment.test.ts tests/activity/atomicity.test.ts tests/security/attack-suite.test.ts: PASS, 4 files / 70 tests.
- npm run test:web -- --run tests: PASS, 2 files / 12 tests.
- npm run test:web -- --run tests/deployment.test.ts: PASS, 1 file / 9 tests, including explicit proxy forwarding of X-Ticket-Version.
- npm run lint: PASS (API and Web).
- npm run typecheck: PASS (API and Web).
- npm run build: PASS (API TypeScript build and Vite production build).
- Full npm test: PASS, API 24 files / 391 tests and Web 2 files / 12 tests.
- npm run test:e2e: PASS, 23 Playwright browser tests, including edit/assignment and stale-edit retry.
- Parent-kit check_skill.py: PASS (packaging only; not product runtime/security evidence).

These local checks do not prove the Vercel response-layer hypothesis or the Production fix.

## Findings and acceptance impact

- F-412 / P1 / VERIFIED observation, UNVERIFIED cause: Production mutation responses sometimes returned 412 while the database change appeared committed. This response/state consistency defect blocks release readiness. Candidate local fix is regression-covered, but exact-SHA Preview repro and retest have not run. Impact: A12 status cannot be carried forward as an unqualified deployed-release PASS; local database concurrency behavior passes.
- A29: local concurrency behavior passes on guarded disposable PostgreSQL with 8/8 tests. Existing historical ETag evidence is superseded locally by X-Ticket-Version; deployed behavior awaits Preview.
- A35 / A36 / G6 / G7 remain blocked or incomplete as recorded by the release plan; this targeted change cannot clear end-to-end Production/deployment/rollback/final-review gates.

## Disposition

NOT_READY. The local candidate is validated by the listed tests and build gates, but Production still runs the prior deployment. Next: deploy this candidate only to Preview through the already authorized release workflow, confirm exact source SHA, run authenticated synthetic update and assignment once each, confirm successful calls return 200 and a stale retry returns 409 without a duplicate event/version change, then review that exact deployment with the parent kit. Production promotion requires separate explicit approval and is not authorized by this review.
