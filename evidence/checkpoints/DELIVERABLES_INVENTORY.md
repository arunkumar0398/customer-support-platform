# Assessment deliverables inventory
## Latest local UI evidence — 2026-11-01

The Hallmark contrast/focus follow-up and expanded browser checks are recorded in [the render report](../reviews/hallmark-followup-2026-11-01/REPORT.md). Local `npm run check` passed and the combined browser suite passed 45/45 on the uncommitted worktree. This improves the tests/results deliverable but does not establish exact-SHA CI or complete A22/A23/A37. The manual screen-reader check, Preview A35, and full offline audit remain open; do not mark those deliverables/gates complete from this work.

## Verified candidate evidence — 2026-11-01

- Candidate 070bf718e6a43a45d699e3b3c065b442c0db7c41 passed Actions [#114](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41287273871); Vercel API/Web are provider success statuses only.
- Application source provenance is 24f51c05328fc764bf7089fce8f398adad475648 / #105; 3e613c0b7df5bec290553cfb7b5a9404bfaec1a1 / #74 is historical.
- Follow-up aac66e4da3b3a52b99b6f6021601245c4f405584 passed Actions #115 exact SHA. The subsequent agent membership denial test is included in the follow-up commit and passed in a 37/37 local E2E run with npm run check. Its exact-SHA CI run is separate from #115.
- Hallmark rendered report is at [evidence/reviews/hallmark-2026-11-01.md](../reviews/hallmark-2026-11-01.md); sign-in only, report-only.
- Preview A35, full audit, and route-wide UI/accessibility completion remain open.

### Required assessment deliverables

| Required item | Path | Current disposition | Remaining action |
|---|---|---|---|
| Source repository | Private GitHub repository and candidate branch | Present; evaluator access unverified | Confirm evaluator read access or approved private handoff.
| README setup/run | `README.md` | Present | Keep aligned to scripts and local-only seed guard.
| Architecture diagram | `docs/architecture.md` | Present | No change required for this UI-only candidate.
| Data model/indexes | `docs/data-model.md` | Present | No change required for this UI-only candidate.
| API docs/examples | `docs/api.md` | Present | No change required for this UI-only candidate.
| Sample accounts/seed | `docs/demo-accounts.md`, `api/prisma/seed.ts` | Present; local-only synthetic accounts | Never use the local shared password in Preview.
| Tests/results | `docs/testing.md`, acceptance ledger, UI matrix | Partial | Record exact-candidate CI after it runs; Preview and audit remain open.
| Tradeoffs/next steps | `docs/limitations.md` | Present | Keep deployment clearly optional and blockers explicit.



## Historical evidence reconciliation — 2026-11-01

**Superseding exact-SHA record:** docs/evidence candidate `cd6e64cd9ed9e61e40f90306a3b4a40d86f9be67` passed Actions [#111](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41278121491), job `verify`, on the exact SHA. Its Vercel API/Web descriptions were “Deployment has completed,” provider statuses only. Fresh G7 on cd6e returned **BLOCKED_BY_ENVIRONMENT**; this candidate still lacks Preview role evidence and full audit execution. This supersedes the older docs-candidate lines below; app/test and application implementation SHAs remain as listed below.

Application/test candidate `c179180a56977cda6fe084786989ae6098afe995` passed Actions #107 (`verify`) on the exact SHA. Its app implementation is unchanged from `24f51c05328fc764bf7089fce8f398adad475648` / #105; `3e613c0…` / #74 is the historical baseline. Exact c179180 Vercel API/Web status contexts were success, provider results only. Neon Preview recovery and 15/15 read-only fixture counts are reported PASS; A35 is BLOCKED / NOT_RUN until credentials and authenticated authorization checks are completed. Fresh G7 on c179180 is BLOCKED_BY_ENVIRONMENT. A22/A23/A37 remain partial, A36 remains a scoped local code-rollback pass, and audit/evaluator-access/A28 gates remain open.

Docs/evidence candidate `0d9589643aec1514694fb12c5e7c29583b99911b` passed Actions [#110](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41276642408), job `verify`, on the exact SHA. Its Vercel API/Web status descriptions said “Deployment has completed,” provider status only. G7 on preceding candidate `4b404f7…` returned **BLOCKED_BY_ENVIRONMENT**; see [report](../reviews/g7-4b404f7-2026-11-01.md). The later docs-only candidate records that verdict and does not modify app/test code.

## Historical evidence snapshot — 2026-11-01

### Latest Preview readiness recheck — 10:08 IST / 04:38 UTC

Neon compute is ACTIVE at endpoint `ep-shy-surf-b36pzssx` on Preview branch `production`; a read-only SELECT 1 returned 1 and the Tables page showed the application schema. The one fixture discovery at 09:11 IST remains the only such query and reported 15 active synthetic memberships and 15 synthetic tickets across two organizations. No writes, seed, or migration ran. API Vercel protection requires login and lists the Web project as a Preview trusted source; deployed database branch alignment is still unverified. A35 preconditions READY; A35 remains BLOCKED / NOT_RUN pending short-lived synthetic credentials and authenticated denial checks. See [readiness report](PREVIEW-READINESS-2026-11-01.md).

Current application/test candidate: `24f51c05328fc764bf7089fce8f398adad475648`; Actions [#105](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41272626603) `verify` passed on the exact SHA. Vercel Web/API are Preview deployments marked Ready on this same commit; their readiness routes returned `{"status":"ready"}` in read-only GETs. The API runtime's Neon branch alignment remains unverified. The previous baseline `3e613c0…` / #74 is historical, not the current implementation candidate. Neon Preview recovery and one read-only discovery remain **reported PASS** (branch `production`, endpoint `ep-shy-surf-b36pzssx`, 15 active synthetic memberships, 15 synthetic tickets); see [readiness report](PREVIEW-READINESS-2026-11-01.md). A35 preconditions are READY, but authenticated A35 is BLOCKED / NOT_RUN pending safe short-lived credentials. A36 passes only the scoped local restore/forward-recovery and prior-code criterion; SQL down-migration/PITR are untested. A22/A23/A37 remain partial. Full offline audit, evaluator access, and A28 rehearsal remain open.

The previous docs/evidence snapshot was `c30917c021d9414f6b870419097b66d69faa4caa`; Actions #106 passed on that exact SHA. The newer test/evidence candidate is `c179180a56977cda6fe084786989ae6098afe995` / #107. Application implementation remains `24f51c05328fc764bf7089fce8f398adad475648` / #105. The Vercel Ready deployment and read-only health smoke on c30917c are historical and not reattributed to c179180. Keep older G7 results tied to their reviewed SHAs.

**Prior docs-status candidate:** `33fdf49a30aee3b67dfac852ba7850f0549d9518`; Actions [run #104](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41271376080) passed exact-SHA `verify`. Vercel Web/API provider descriptions said “Deployment has completed”; provider completion is not runtime evidence. G7 on that exact SHA returned **BLOCKED_BY_ENVIRONMENT** ([report](../reviews/g7-33fdf49-2026-11-01.md)); the current docs candidate records that verdict. Preview app source is `a5673cbcee3c6b30178404c80c1eb1bf56f963a4`; historic source-run `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1` / #74 remains distinct.

**Historical reviewed docs-status candidate:** `24f1d953ef487a42928ccc21923bf0dc3cca1dd7`; Actions #102 job `verify` passed on exact SHA. Vercel Web/API status markers were `success` but descriptions said “Canceled by Ignored Build Step”; neither was deployment evidence. G7 on 24f1 returned **BLOCKED_BY_ENVIRONMENT** ([report](../reviews/g7-24f1d95-2026-11-01.md)). Current application/test candidate and exact #105 result are listed above. Earlier `3e613c0…` / #74 remains historical baseline evidence.

Historical prior candidate `acf01641263275507f4b781bc980cf9e810c9e49`; Actions #95 `verify` and exact-SHA Vercel Web/API checks succeeded. It contains documentation plus a test-only assignment-rollback regression; implementation source remains `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. Baseline `5e27f68a7f2c8aa12c502995b26c2b5063e1309b` / #94 had Vercel provider quota statuses.

Reviewed against the employer assessment, `reference/assessment.pdf` page 2, and remote branch `codex/clean-candidate-b2fd369`. Candidate `24f1d953ef487a42928ccc21923bf0dc3cca1dd7` passed Actions #102; Vercel Web/API contexts were canceled by the ignored-build step. Application implementation remains source SHA `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. The artifacts here do not imply every acceptance gate passed. Full content review: [ASSESSMENT_DELIVERY_REVIEW_2026-10-31.md](ASSESSMENT_DELIVERY_REVIEW_2026-10-31.md).

## Preview readiness update — 2026-11-01

Neon recovery and one read-only fixture discovery are reported PASS (15 active synthetic memberships, 15 synthetic tickets; branch production, endpoint ep-shy-surf-b36pzssx). Preview app health/readiness passed on source a5673cbcee3c6b30178404c80c1eb1bf56f963a4. A35 preconditions are ready; authenticated acceptance remains BLOCKED / NOT_RUN for lack of safe Preview passwords. See [sanitized report](PREVIEW-READINESS-2026-11-01.md). A36 passes its local restore/forward-recovery and prior-code compatibility criterion; SQL down-migration/PITR remain untested. A22/A23/A37 remain partial, not full passes.

| Required submission | Status | Evidence path / observed state | Remaining action |
|---|---|---|---|
| 1. Source repository | **PARTIAL** | [Private GitHub repository](https://github.com/arunkumar0398/customer-support-platform), branch `codex/clean-candidate-b2fd369`; app implementation `24f51c05328fc764bf7089fce8f398adad475648` / #105; test/evidence candidate `c179180a56977cda6fe084786989ae6098afe995` / #107; validated docs/evidence candidate `cd6e64cd9ed9e61e40f90306a3b4a40d86f9be67` / #111. G7 was performed on cd6e and returned BLOCKED_BY_ENVIRONMENT. Prior docs snapshot `c30917c…` / #106 and historical baseline `3e613c0…` / #74 remain separate. | Evaluator access is unverified. Owner must grant evaluator access or provide an approved private source handoff. Keep the repo private unless visibility change is explicitly authorized. |
| 2. README setup and run instructions | **COMPLETE** | [README.md](../../README.md) documents Node/npm prerequisites, local environment, migrations/seed, Docker-local run, checks, and browser tests. | Keep scripts and prerequisites aligned if implementation changes. |
| 3. Architecture diagram | **COMPLETE** | [docs/architecture.md](../../docs/architecture.md) includes local Docker, development proxy, hosted Vercel/Neon topology and request flow. | Provider behavior remains SHA-specific; it is not a claim that every documentation commit deployed. |
| 4. Data model and key indexes | **COMPLETE** | [docs/data-model.md](../../docs/data-model.md) matches Prisma schema and migrations: Organization, User, Membership, Ticket, Comment, ActivityEvent, Session; tenant composite foreign keys/checks and named indexes are listed. | Keep schema/migration changes reflected here. |
| 5. API documentation/examples | **COMPLETE** | [docs/api.md](../../docs/api.md) documents mounted routes, auth/CSRF/tenant expectations, ticket lifecycle, comments/history, memberships, dashboard, pagination, and error examples. | Browser and Preview behavior remains a separate unclosed acceptance gate. |
| 6. Sample credentials or seed instructions | **COMPLETE** | [docs/demo-accounts.md](../../docs/demo-accounts.md) and [api/prisma/seed.ts](../../api/prisma/seed.ts) document synthetic two-org accounts/fixtures and guarded local-only seeding. | Use only local synthetic credentials; they are not deployed-account credentials. |
| 7. Test instructions and results | **PARTIAL** | [docs/testing.md](../../docs/testing.md), [acceptance ledger](acceptance-status.md), [UI matrix](UI_A22_A23_MATRIX_2026-11-01.md), and [A36 recovery evidence](A36-migration-recovery-2026-11-01.md). Actions #105 passed on app implementation SHA `24f51c0…`; Actions #107 passed exact test/evidence SHA `c179180…` (job `verify`). Local `npm run check` (API 392/392, Web 12/12, lint/typecheck/build) and E2E 29/29 passed; added keyboard/mobile assertions are included in #107. | Preview role acceptance and full offline audit remain open; A22/A23/A37 remain partial. Complete remaining matrices and preserve exact SHA/environment details. Vercel statuses are not substitutes for runtime smoke or role tests. |
| 8. Tradeoffs, limitations, next steps | **COMPLETE** | [docs/limitations.md](../../docs/limitations.md) covers process-local login throttle, capped offset pagination, no signup/password reset, duplicate-create retry risk, open Preview/security checks, and optional deployment. | Close each open gate only from observed evidence. |

## SHA-specific validation

- Application source `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`: Actions #74 `verify` success; Vercel Web and API checks success.
- Prior docs-only candidate `85ae41ebf76fea8e1a919f309de8c1a6a1195518`: Actions #90 `verify` success; Vercel Web and API checks both failed with “Deployment rate limited — retry in 24 hours.”
- `baa72999f558c6b2f97f4990c8bacc21e4d0bf83` / Actions #92 passed (Web success, API provider quota); `73182951dcc15b22096e6c52088c392626b6c9c8` / #93, `5e27f68a7f2c8aa12c502995b26c2b5063e1309b` / #94, and `224771c1515c8f39a425e5ef060eb39e0d534a04` / #96 passed with Web/API provider quota statuses; `acf01641263275507f4b781bc980cf9e810c9e49` / #95 passed with Web/API success; current `e78b19c6d6aa2e02876e8444aa42413fa4159428` / #97 passed while Web/API builds were skipped by the ignored-build step. Each result is SHA-bound.
- `cd0b04ff830a187d45fd3370db97a22c2adba476` / Actions #101 reported provider deployment completion without runtime smoke. Reviewed candidate `24f1d953ef487a42928ccc21923bf0dc3cca1dd7` / Actions #102 passed; its Web/API `success` markers describe ignored-build cancellations, not deployments.

## Open gates

- Preview agent/customer flows and same-tenant-other-customer/foreign-tenant denials, including before/after state: **BLOCKED / NOT_RUN** pending safe synthetic credentials. Neon compute recovery, SELECT 1, schema presence, and the one read-only fixture discovery (15 memberships/15 tickets across two orgs) are reported PASS; no authenticated requests or data mutations were made.
- Full bounded offline audit: **BLOCKED / INCOMPLETE** because the available Docker Linux images lack compatible preinstalled test runners. The repo-contained report documents only bounded pure-helper tests; route, database, proxy, throttle, UI, and supply-chain audit lanes remain unverified. No deployed probes or dependency installation/fetch occurred. See [environment readiness record](SECURITY-AUDIT-ENVIRONMENT-2026-11-01.md).
- Fresh G7 on exact candidate c179180 and docs head 4b404f7 returned **BLOCKED_BY_ENVIRONMENT**; see the [c179180 review](../reviews/g7-c179180-2026-11-01.md) and [4b404f7 review](../reviews/g7-4b404f7-2026-11-01.md). Release remains blocked by Preview credentials/authorization evidence, the full audit, evaluator access, A28 rehearsal, and broader UI evidence.
- Deployment URL: **OPTIONAL** under the assessment. Current Vercel API rate-limit results do not require a paid-plan upgrade.
