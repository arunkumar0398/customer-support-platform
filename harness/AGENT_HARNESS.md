# Agent Harness — Execution and Control Protocol

**Purpose:** Coordinate software-building agents while using deterministic evidence as the release authority. Superpowers is the skill methodology; this harness is the additional local repository policy and CI/test orchestration.

## 1. Agents and responsibilities

| Agent | Allowed work | Must not do | Output |
|---|---|---|---|
| Orchestrator (Codex Desktop) | Decompose, allocate, track gates, request review, synthesize status | Silent scope expansion, merging/releasing without approval | Plan, task ledger, gate summary |
| Spec analyst | Map PDF requirements and sign-off assumptions | Write implementation as facts before design approval | Spec, requirement IDs, edge cases |
| Implementer | One bounded test-first task on worktree | Skip tests, write unrelated files, bypass tenant checks | Diff, tests, commit, report |
| Spec reviewer (fresh) | Check diff against task and assessment | Fix code or mark done without evidence | Missing/extra requirements findings |
| Code/security reviewer (fresh) | Check architecture, code quality, abuse, correctness | Rely only on author claims | Prioritized P0–P2 findings |
| QA/browser agent | Real browser journeys and screenshots, accessibility checks | Change app code in QA worktree | Browser result artifact, screenshots |
| DevOps reviewer | CI, Compose, build, deployment/rollback | Store secrets, buy services without approval | Deploy/runbook verification |
| Release auditor | Replay exact SHA from clean checkout | Approve unresolved P0/P1 | Review release verdict |

## 2. Orchestration state machine

```
UNSTARTED -> SPEC_DRAFT -> SPEC_APPROVED -> PLAN_READY
-> IMPLEMENTING -> TEST_GREEN -> SPEC_REVIEWED -> QUALITY_REVIEWED
-> INTEGRATED -> RELEASE_CANDIDATE -> DEPLOYED_VERIFIED -> REVIEW_READY
```

A failed check moves task to `BLOCKED`/`REWORK`, never directly to `DONE`. `DEPLOYED_VERIFIED` can be replaced with `LOCAL_ONLY_ACCEPTED` only by an explicit scope decision; live deploy is optional under PDF but required for this extended plan.

## 3. Correct skill selection

- `using-superpowers`: startup, discover relevant skill workflows.
- `brainstorming`: turn PDF into explicit design and assumptions. Timebox discussion; user already provided product requirements.
- `using-git-worktrees`: isolate features and reviews; baseline clean and known HEAD.
- `writing-plans`: break approved spec into small testable tasks with paths, inputs, outputs, and checks.
- `subagent-driven-development`: fresh implementer per task plus spec and code-quality reviews in capable harnesses; use `executing-plans` only if subagents unavailable.
- `test-driven-development`: red, green, refactor and evidence.
- `dispatching-parallel-agents`: only for disjoint file trees/tasks after API contract freeze.
- `systematic-debugging`: reproduce and find root cause before changing failing logic.
- `requesting-code-review`: after tasks/milestones; address severity before continuing.
- `receiving-code-review`: verify feedback technically; write regression rather than patching blindly.
- `verification-before-completion`: run exact commands and check exit code/log for every 'done' claim.
- `finishing-a-development-branch`: no final merge until release approval.

## 4. Worktree topology and concurrency

```
main                               # stable, protected
assessment/foundation              # primary integration branch
worktrees/task-auth-...            # isolated branch, shared scope only on merge
worktrees/task-tickets-...
worktrees/task-web-...
worktrees/review-security-...       # read-only replay
```

Parallelize docs with backend, UI shell with frozen API types, or independent review. Serialize schema + API contract work, shared auth middleware and integration changes. No more than 2 independent implementers at once unless the file ownership map proves isolation.

## 5. Task card template

```
ID: TK-XX
Source requirements: R-xx, acceptance IDs: A-xx
Skill(s): test-driven-development, requesting-code-review
Inputs: frozen design commit / API types / fixture requirements
Owned paths: api/src/modules/tickets/**, api/tests/tickets/**
Not allowed: schema.prisma, shared auth middleware (unless explicitly assigned)
Red: command + expected failing assertion
Green: command + expected behavior
Security cases: tenant A/B, owner check, malformed input
Exit: tests green, task-specific diff, docs updated, 2-stage reviews
Evidence: evidence/checkpoints/TK-XX.md
```

## 6. Machine checks / minimum workflows

1. `preflight`: clean install on pinned Node runtime; parse and validate package scripts and lockfile; forbid secrets/fixtures from being exposed.
2. `db`: start isolated PostgreSQL, migrate from empty state, seed 2 orgs, verify migration fails or isolates malformed cross-org data.
3. `api`: Vitest/Supertest integration tests against PostgreSQL; reset test DB intentionally only inside dedicated test container.
4. `web`: TypeScript, unit/component tests, production build.
5. `browser`: Playwright desktop+mobile with seeded roles; capture artifacts on failure.
6. `security`: adversarial A/B requests, malicious properties, cookie/CSRF and role checks; dependency audit and secret scan.
7. `deploy`: health/readiness + production link smoke on exact commit, no live DB destructive resets.
8. `release`: recompute all gates with clean clone, generate release evidence, get independent final reviewer approval.

Prefer checked-in `scripts/verify.sh` for Linux CI and equivalent cross-platform npm scripts for Windows; do not hide a Linux-only failure behind local Windows skipped tests.

## 7. Three-level independence

- **Author self-test**: implementer runs targeted red/green tests.
- **Independent reviewer**: reviewer sees spec + diff + outputs, tries to falsify rather than praise.
- **Independent verifier**: runs acceptance suite from exact SHA and reports failures, no access to author's uncommitted files.

The orchestrator cannot waive a failed deterministic test by citing an LLM reviewer opinion.

## 8. Quality/severity rubric

- `P0` Critical: cross-tenant data exposure, auth bypass, destructive migration, production secrets or persistent data loss.
- `P1` High: broken required journey, same-org customer privacy breach, non-atomic audit state, stale write loss, unreproducible local setup, migration failure, broken deployment.
- `P2` Medium: accessibility deficiency, incomplete optional feature, moderate usability or observability gap, indexing inefficiency within demo scale.
- `P3` Low: cosmetic improvement, preferred refactor or nice-to-have.

**Release gate:** zero unresolved P0/P1. P2 documented with owner/risk mitigation; P3 may be backlog.

## 9. Security harness: tenant access invariant

For every route that accepts `ticketId`, `organizationId`, `memberId`, `commentId`, or pagination/filter criteria:

1. Authenticate user and derive membership from persistent DB/session.
2. Establish a server-validated active organization context.
3. Scope the ORM/database query by org; additionally apply role and ownership constraints.
4. On create/update validate foreign relationship *in that same org*; use DB FK/unique constraints where possible.
5. Test access with a valid foreign-org ID, valid same-org other-customer ID, and invalid role.
6. Do not reveal existence of hidden tickets in response content, errors, totals or dashboard aggregates.
7. Run requests for GET, PATCH, POST comments, assignment, history, dashboard and membership management.

## 10. Safe stopping, context resets, and intervention

- Human approval required: spec design; new cost-bearing deployment; secrets; production migration; final push/merge/publish if not explicitly authorized.
- Stop immediately on P0 security failure, unrecognized production data, destructive DB commands, overwritten local work, or unrelated changes in diff.
- Record `handoff.md` with: repo root, branch/HEAD, git status, exact diff, untracked files, task state, tests, blockers, pending review threads, next smallest action.
- Resume from artifacts; do not infer from conversational memory alone.
- CI failure must reproduce in a supported environment before fixing; record platform differences.

## 11. Release-evidence manifest (suggested)

```
evidence/
  checkpoint-status.md
  checkpoints/TK-01.md
  test-results/api.txt
  test-results/web.txt
  test-results/e2e.txt
  browser/mobile-login.png
  browser/ticket-detail.png
  security/tenant-isolation.txt
  performance/query-plan.txt
  deploy/health-check.txt
  deploy/smoke-test.txt
  review/spec.md
  review/security.md
  review/backend.md
  review/frontend.md
  review/ops.md
  release-evidence.md
```

Only store redacted logs and screenshots containing demo data.
