# Assessment deliverables inventory

Reviewed against the employer assessment, `reference/assessment.pdf` page 2, and remote branch `codex/clean-candidate-b2fd369`. Latest fully checked documentation/source tree for this review is `baa72999f558c6b2f97f4990c8bacc21e4d0bf83` (Actions #92); its parent docs snapshot `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1` passed Actions #91. Application code remains at source SHA `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`. The documentation files here are evidence of submission content, not proof of every acceptance gate.

| Required submission | Status | Evidence path / observed state | Remaining action |
|---|---|---|---|
| 1. Source repository | **PARTIAL** | [Private GitHub repository](https://github.com/arunkumar0398/customer-support-platform), branch `codex/clean-candidate-b2fd369`; source `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`, docs snapshot `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1`. | Evaluator access is unverified. Owner must grant evaluator access or provide an approved private source handoff. Keep the repo private unless visibility change is explicitly authorized. |
| 2. README setup and run instructions | **COMPLETE** | [README.md](../../README.md) documents Node/npm prerequisites, local environment, migrations/seed, Docker-local run, checks, and browser tests. | Keep scripts and prerequisites aligned if implementation changes. |
| 3. Architecture diagram | **COMPLETE** | [docs/architecture.md](../../docs/architecture.md) includes local Docker, development proxy, hosted Vercel/Neon topology and request flow. | Provider behavior remains SHA-specific; it is not a claim that every documentation commit deployed. |
| 4. Data model and key indexes | **COMPLETE** | [docs/data-model.md](../../docs/data-model.md) matches Prisma schema and migrations: Organization, User, Membership, Ticket, Comment, ActivityEvent, Session; tenant composite foreign keys/checks and named indexes are listed. | Keep schema/migration changes reflected here. |
| 5. API documentation/examples | **COMPLETE** | [docs/api.md](../../docs/api.md) documents mounted routes, auth/CSRF/tenant expectations, ticket lifecycle, comments/history, memberships, dashboard, pagination, and error examples. | Browser and Preview behavior remains a separate unclosed acceptance gate. |
| 6. Sample credentials or seed instructions | **COMPLETE** | [docs/demo-accounts.md](../../docs/demo-accounts.md) and [api/prisma/seed.ts](../../api/prisma/seed.ts) document synthetic two-org accounts/fixtures and guarded local-only seeding. | Use only local synthetic credentials; they are not deployed-account credentials. |
| 7. Test instructions and results | **COMPLETE** | [docs/testing.md](../../docs/testing.md), [acceptance ledger](acceptance-status.md), and task evidence. Actions #74 passed at source `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`; #91 passed at docs snapshot `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1`. | Preview and full audit are explicitly blocked/not run. Vercel API quota is not a test failure. |
| 8. Tradeoffs, limitations, next steps | **COMPLETE** | [docs/limitations.md](../../docs/limitations.md) covers process-local login throttle, capped offset pagination, no signup/password reset, duplicate-create retry risk, open Preview/security checks, and optional deployment. | Close each open gate only from observed evidence. |

## SHA-specific validation

- Application source `3e613c0b7df5bec290553cfb7b5a9404bfaec1a1`: Actions #74 `verify` success; Vercel Web and API checks success.
- Prior docs-only candidate `85ae41ebf76fea8e1a919f309de8c1a6a1195518`: Actions #90 `verify` success; Vercel Web and API checks both failed with “Deployment rate limited — retry in 24 hours.”
- Latest checked docs candidate `baa72999f558c6b2f97f4990c8bacc21e4d0bf83`: Actions #92 `verify` success; Vercel Web success; API failed with the same provider build-quota reason. Parent docs snapshot `6d8f19bcca5d03c0ae9dc42ced379928bd818ac1` / Actions #91 remains historical.
- The recorded exact-SHA status for `baa72999f558c6b2f97f4990c8bacc21e4d0bf83` does not transfer to later commits.

## Open gates

- Preview agent/customer flows and same-tenant-other-customer/foreign-tenant denials, including before/after state: **BLOCKED / NOT_RUN** pending owner-confirmed Neon compute, safe synthetic credentials, and a verified foreign-tenant fixture.
- Full bounded offline audit: **BLOCKED / NOT_RUN** pending compatible preinstalled Linux runners in the OS-enforced no-network sandbox. Run-6 is helper-only evidence.
- Fresh G7: **BLOCKED** until the remaining acceptance/audit evidence is available and reviewed.
- Deployment URL: **OPTIONAL** under the assessment. Current Vercel API rate-limit results do not require a paid-plan upgrade.
