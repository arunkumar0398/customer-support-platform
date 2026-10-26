# Narrow Correction Following Independent Review

--- BEGIN ---
Continue the local assessment repository. Read root `AGENTS.md`, actual Git state, approved design/plan, latest `evidence/reviews/` report and `evidence/checkpoints/CURRENT_HANDOFF.md` if present. Preserve all local work and never reset/clean/force push.

Select the HIGHEST severity reproducible P0/P1 review finding, preferably one independent root cause. Confirm it by executing the stated failing check against the exact current branch/SHA. Use `systematic-debugging` and `test-driven-development`: capture regression RED, apply narrow fix, run GREEN and impacted integration security/e2e suites, then use fresh spec and quality review. Update evidence and acceptance IDs, commit only verified files when permitted. Do not expand to unrelated issues, suppress test checks or deploy until original gate and affected regressions are independently green.

Report precise files, reproduction, source requirement ID, failure root cause, fix, commands/exit codes, remaining findings and next smallest dependency-ready issue.
--- END ---
