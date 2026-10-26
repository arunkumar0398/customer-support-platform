# Independent Fresh Review — Reviewer Agent Task

Open a new Codex Desktop local thread/worktree from the **exact candidate SHA**, after implementation checkpoints are complete. Ideally reviewer is not the implementer.

--- BEGIN ---
Act as a skeptical independent Full Stack Engineer assessment reviewer for this LOCAL repository. Your task is READ, REPRODUCE and REPORT; no code edits, merges or deployments unless separately authorized.

Ground truth: `reference/assessment.pdf`, root `AGENTS.md`, `harness/REQUIREMENTS_TRACEABILITY.md`, `harness/ACCEPTANCE_MATRIX.md`, `harness/SECURITY_CONTRACT.md`, `harness/FINAL_REVIEW_CHECKLIST.md` and implementation's design/API/data docs. Do not trust previous author claims.

1. Capture root, branch, full SHA, all diff/untracked files and environment. If candidate isn't a clean committed SHA, explain blocker.
2. Inspect every PDF requirement and map to code, real tests and docs. For A01–A40 record PASS/FAIL/BLOCKED/NOT_RUN/OPTIONAL_NOT_IMPLEMENTED; no inference-only PASS.
3. Replay fresh clean-install, Docker migrations/seeds, real DB API tests, frontend build, Playwright roles/navigation/error states, CI artifacts and deployment smoke if URL available.
4. Execute adversarial cross-org known-ID GET/PATCH/comment/assignment/events/dashboard/search, same-org other customer, role privilege escalation, mass assignment, CSRF/session/expiry and stale-write race tests. Check audit atomicity, index constraints and duplicate/retry behavior.
5. Review Vercel/Neon only if deployed: exact deployed SHA, rewrite/SPA/secure-cookie/CSRF behavior, pooled vs direct DB migration URLs, preview/production isolation, secret hygiene, health/errors/backup/rollback. Never use destructive prod tests.
6. Review accessibility, mobile viewport, frontend state, the 8 required submission artifacts and honest AI usage disclosure.

Output `evidence/reviews/final-review.md` with exact SHA, commands/exit codes, specific file:line findings, severity P0/P1/P2/P3, reproducer, expected/actual, affected AIDs, proposed minimal regression test and disposition. Result MUST be `READY / NOT_READY / BLOCKED`, and cannot be READY with any open P0/P1 or unverified required tests.
--- END ---
