# Finite assessment-readiness plan

This plan separates Section 8 assessment requirements from additional internal release gates. Starting local audit candidate: c79f74dd62fa11a12ac6cafe416a40c099cf9ede. The substantive package being prepared changes that candidate; the resulting committed SHA will be recorded in the launch record. It does not authorize remote writes, push, merge, deployment, or submission.

## Required by assessment Section 8

| Deliverable / requirement | Owner | Current repository evidence | Remaining action and prerequisite | Exit evidence |
|---|---|---|---|---|
| Working vertical slice: login, tenant authorization, ticket create/list/filter/detail/update, persistent DB, minimal dashboard, basic automated tests, local Docker | Maintainer | API/web source, Prisma schema/migrations, Docker Compose, local E2E and CI records in README/testing evidence | Fresh-checkout setup rehearsal on a clean worktree; ensure documented commands work with no use of hosted data | Commands, environment, exit codes, and synthetic-only test results tied to an exact source SHA |
| (1) Source repository | Repository owner | Private GitHub repository is named in existing documentation; this isolated checkout’s origin is a local filesystem path, its candidate branch is local/unpushed, and evaluator access is unverified | Confirm evaluator read access or use an owner-approved private handoff; keep visibility private | Evaluator access is verified or recipient/handoff access is recorded |
| (2) README setup/run | Maintainer | README.md | Rehearse prerequisites, env setup, migration/seed, local run, and tests from clean checkout; fix only observed gaps | Fresh setup/run succeeds and commands match actual scripts |
| (3) Architecture diagram | Maintainer | docs/architecture.md (present; includes system and request-flow Mermaid diagrams) | Check request/data flow, API, web, PostgreSQL, tenant boundary, sessions, and local Docker are legible and current | Reviewer can trace login and ticket request/data flow |
| (4) Data model and key indexes | API maintainer | api/prisma/schema.prisma, migrations, docs/data-model.md (all present) | Confirm entities, composite tenant constraints, and indexes described match schema/migrations | All named constraints/indexes exist in current source |
| (5) API documentation/examples | API maintainer | docs/api.md and route schemas (present; implemented routes and proxy contract documented) | Verify auth/CSRF/origin requirements, roles, errors, pagination, and concrete request/response examples against actual routes | Readable examples match Zod/HTTP behavior |
| (6) Sample credentials or seed instructions | Maintainer | docs/demo-accounts.md and local-only guarded seed (present; synthetic accounts and local-only restriction documented) | Keep synthetic demo credentials explicitly local-only; rehearse seed guard against disposable local DB; never try shared demo password in Preview | Setup guide works locally and states credential scope safely |
| (7) Test instructions/results | Maintainer | docs/testing.md and exact-SHA CI/evidence links (present, but this candidate’s run-8 retained lane is pending) | Record this candidate’s exact API lane after safe promotion integrity; separate historical Run 7, current local checks, and future lanes | Command, exact SHA/archive hash, environment, exit status, counts, retained output and limits agree |
| (8) Tradeoffs/limitations/next steps | Maintainer | docs/limitations.md is present | Update its stale Run-6 throttle sentence after exact-candidate Run-8 capacity result and independent disposition; retain offset cap, no signup/password reset, optional deployment, and Preview/audit gates | Concise limitations note matches implementation and open evidence |
| A28 engineering discussion | Maintainer / human reviewer | Acceptance matrix and architecture/operations docs | Human rehearsal: query-plan investigation, tenant isolation, concurrent edits, outage behavior, recovery/rollback; record date, reviewer, questions, and follow-up. Do not self-label a human rehearsal | A28 evidence recorded by actual participant; remain NOT_RUN until then |

Deployment URL and CI are optional in assessment Section 8. CI remains useful internal evidence but does not replace the required basic automated tests or local Docker setup.

## Internal release gates (not extra employer deliverables)

| Gate | Owner | Prerequisite | Work / evidence | Exit condition |
|---|---|---|---|---|
| Audit runner integrity | Maintainer | Source-binding/promoter package committed on isolated branch | Run adversarial source and artifact tests; invoke only from clean exact commit; retain runner record and safe outputs outside repo | Source tree/archive binding verified; target terminated before no-follow allowlisted promotion; output hashes match |
| API/security coverage | Maintainer + separate verifier | Runner integrity passed; pinned image/toolchain available | Run API lane once on exact candidate; map test assertions to session/CSRF, object/child auth, membership, rollback/version conflicts, and error confidentiality. Run missing cases only where a criterion lacks assertions | Each unit has exact source SHA, method/test assertion, command/exit, artifact and limitation; do not infer covered from aggregate suite |
| Login throttle | API maintainer + independent verifier | Exact candidate API lane | Verify real limiter capacity at 4,096 live map entries, existing/new keys, expiry recovery, independent account/IP counts, and process restart using dummy data and deterministic time | Candidate disposition is confirmed, rejected, or needs_validation. Local process results do not establish Vercel multi-instance/deployed behavior |
| Query plans A38 | API maintainer | Existing A38 evidence; verify query/schema files unchanged from its recorded SHA | Reuse the bounded 50,000-row first/deep page, filter, count, and search plans if all query/index inputs are unchanged; rerun against disposable local PostgreSQL only if relevant files changed | Evidence is tied to exact source and documented threshold/interpretation; no arbitrary no-seq-scan rule |
| Recovery A36 | API maintainer | Existing A36 report; verified schema and all three migrations unchanged from the recorded A36 source | Reuse only its local logical restore/forward-migration and previous-code scope if migration/schema files are unchanged. Keep SQL reversal and hosted PITR separate | Report accurately states local recovery strategy and untested rollback/PITR |
| Proxy | Web/API maintainer | Existing local proxy tests/stub | Exercise path/origin/method/header/cookie/redirect behavior against local stub; no hosted calls | Request/response assertions pass on exact candidate; Vercel settings remain owner-verification facts |
| UI, A22/A23/A37, Hallmark | Web maintainer + human assistive-tech reviewer | Compare current web source to measured Hallmark candidate | Run finite missing route × role × viewport × state cells; verify keyboard/focus, retry/error states and reduced motion; manual screen-reader journey remains human-led | Every required matrix cell observed pass/fail or justified N/A; no blanket accessibility claim |
| Preview A35 | Neon/Vercel owner then acceptance operator | Specific written approval package; exact endpoint-to-branch mapping; role name; short-lived synthetic credentials; exact deployments; runtime binding | Use the attached execution-approval package and its unique run ID once. Run permitted journeys and denial/no-write checks, then exact-manifest cleanup/revocation | Permitted journeys pass; unauthorized reads/writes denied; ticket/version/comment/activity snapshots unchanged for denied writes; zero residual fixture data |
| Cloudflare audit | Audit operator + independent verifier | Clean exact candidate; isolated pinned image; source binding; safe promotion; preinstalled tools | Execute bounded lanes for auth/session, tenant/membership, DB atomicity, proxy, query bounds, supply chain, and client/UI; validate findings and coverage; independently challenge candidates | Full audit only if all applicable phases reach defensible terminal dispositions and official validators pass; otherwise incomplete with exact blockers |
| Fresh G7 | Independent reviewer | Candidate/evidence/documents reconciled; no unresolved release-blocking findings | Read-only review exact final SHA; distinguish source review, dynamic evidence, hosted evidence, and historical results | Explicit exact-SHA verdict. Do not claim a review until one is actually returned |

## Current deliverable inventory snapshot

- Source repository: PARTIAL for submission; private upstream is documented, but this isolated branch has only a local filesystem origin and evaluator access is unverified.
- README setup/run: PRESENT; fresh-checkout rehearsal still required.
- Architecture diagram: PRESENT at docs/architecture.md.
- Data model/indexes: PRESENT at docs/data-model.md with source schema/migrations.
- API docs/examples: PRESENT at docs/api.md.
- Sample credentials/seed instructions: PRESENT at docs/demo-accounts.md; local synthetic credentials only.
- Test instructions/results: PARTIAL at docs/testing.md and external Run-7 artifacts; exact committed Run-8 output for this code package is pending.
- Tradeoffs/limitations/next steps: PRESENT at docs/limitations.md; update the old Run-6 throttle wording after the new candidate result.

## Immediate sequence

1. DONE locally: source-bound launcher/promoter package committed as 4ff774cdabfec3ffe0726ee766431f0dc3da3de1; focused pinned-image tests passed 8/8 source-binding and 12/12 promoter/verifier/launch-record tests. No exact candidate lane was claimed by those unit tests.
2. DONE locally: throttle middleware export/test committed separately as c1e73a31fea0bebda73c063f6e2816c6c1a88e0a. The focused 4-test file had an implementation-stage pass; exact-SHA API lane and independent throttle disposition remain pending.
3. Commit the concrete Preview approval/deliverables plan package, then run the full API lane exactly once on the resulting clean SHA and retain parent-promoted outputs. Map test names/assertions and limitations; ask a fresh independent verifier to review the throttle result, not the entire project.
4. Confirm whether query/index and migration files are unchanged from A38/A36 recorded sources. Reuse only the documented scoped results if unchanged.
5. Run any missing local proxy or UI tests that existing evidence does not cover. Do not run screen-reader claims without a human test.
6. Present the concrete Preview approval package to the owner for the missing role name, endpoint mapping, and explicit approval. Do not execute hosted writes until those exact fields are confirmed.
7. Complete required deliverable review, evaluator access, and human A28 rehearsal; then prepare one substantive evidence package and request exact-SHA G7. Keep merge/submission on hold until G7 is ready.
