# Exact-SHA assessment test evidence — `19246132f22bd0e37b6a6a0b9286bb1621d3bad1`

This record summarizes output observed in GitHub Actions run [#130](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41459211826), job `verify`, for the exact source SHA above. The run completed successfully. It is CI evidence, not a local clean-checkout rehearsal.

The job's [sanitized gate-log artifact](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41459211826/artifacts/13147913558) is named `ci-gate-logs`; artifact metadata reported SHA-256 `2dcad7d62b90a2b2a25240bcfb945a69bc7a8669e16cc2ecdace0ea06f621e60` and expiry `2026-11-09`. The job log, which prints the sanitized gate outputs before upload, and the artifact metadata were inspected on 2026-11-02. The artifact remains subject to GitHub's expiry; this committed summary preserves the observed gate commands and outcomes.

| Gate command | Observed result |
|---|---|
| `npm ci` | Passed. |
| `npm run db:verify-test` | Passed against the CI disposable database. |
| `npm run db:migrate`, `npm run db:seed`, `npm run db:migrate:test` | All passed against the workflow's disposable local databases. |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm run test:api` | 28 files, 431 tests passed. |
| `npm run test:web` | 2 files, 17 tests passed. |
| `npm run test:e2e` | 47 tests passed. |
| `npm run build` | Passed. |

The workflow completed with conclusion `success`. These gates establish the commands and results above on `19246132…`; they do not establish Preview authorization, Production user flows, manual accessibility, or a separate local `npm run check` invocation.

## Rehearsal artifact limitation

The separately cited `assessment-rehearsal-19246132-2026-11-02.md` and its local output files were not present in the PR branch or available project worktrees when checked, and the path returned 404 from GitHub at this SHA. Therefore this PR does not claim the previously summarized local `npm run check`, Playwright, or `support_test` migration rehearsal as independently inspectable local evidence. Use Actions #130 and its recorded CI gates above for test-results evidence; local Compose startup/migration/seed evidence remains in the exact-SHA readiness report.
