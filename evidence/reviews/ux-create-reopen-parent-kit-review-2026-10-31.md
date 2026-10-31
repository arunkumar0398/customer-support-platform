# Parent-kit review — ticket create and reopen UX follow-up

- Date: 2026-10-31
- Checkout: `customer-support-platform-preview-fixes`
- Branch: `codex/preview-mobile-roster-ux`
- HEAD: `981697f0dce286116e035c3c3a9d0f6850bfea94`
- Review scope: uncommitted requester lookup and ticket create/reopen UI diff, including the reopen field accessibility correction.
- Method: separate read-only reviewer agent used `100xdevs_assessment_review_agent_skill` in the parent folder. The checkout was shared, not a separate worktree. Ten existing TK-29 screenshot modifications were preserved.

## Result

**No P0, P1, or P2 findings in the reviewed create/reopen changes. Release verdict: NOT_READY.**

The reviewer confirmed by source inspection that the requester lookup is behind authentication, active membership, and staff authorization; it returns active same-organization customer IDs/emails only. The customer selector has loading/error/empty/selection states and the create API remains authoritative. The reopen reason field now exposes `aria-invalid`, connects the inline error through `aria-describedby`, and clears the invalid state after correction.

## Independent verification

- `npm run lint`: exit 0.
- `npm run typecheck`: exit 0.
- `git diff --check`: exit 0.
- Reviewer did not independently rerun PostgreSQL tests or Playwright. The local evidence in `evidence/checkpoints/TK-25-2026-10-31.md` records those separate runs.

## Remaining gates

- A35 / G6 Preview: **BLOCKED** until the exact candidate is deployed and authenticated agent/customer journeys plus foreign-object denials are proven.
- A36 migration/rollback compatibility: **NOT_RUN** on this exact candidate.
- A37 broad route-wide accessibility/responsive audit: **NOT_RUN**; targeted reopen-field accessibility test passes but does not close the gate.
- G7 exact deployed-candidate final review: **BLOCKED** while changes remain uncommitted/undeployed and release gates remain open.
- Docker fresh-volume check is now recorded separately in TK-25; it used a newly created isolated local Compose project and was cleaned up after healthy startup checks.

## Later Preview follow-up

After this read-only review, the change was committed/pushed as `a44a96d50cda832b824716484b5c7a8cffd9b7df` and deployed Ready to both Vercel Preview projects. An authenticated Preview smoke then verified health/readiness, the staff customer picker, ticket #4 creation, blank-reason denial, a reasoned reopen, and restoration of ticket #3. Agent/customer login and foreign-tenant object denial remain open, so the **NOT_READY** release verdict still applies. See [Preview validation](preview-validation-2026-10-31.md) and [TK-25 evidence](../checkpoints/TK-25-2026-10-31.md) for post-review results.
