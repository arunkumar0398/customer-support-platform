# Section 8 deliverables

Section 8 of [the assessment](../../reference/assessment.pdf) defines the
submission items. This inventory reflects evidence tied to default branch
codex/assessment-mvp at SHA 19246132f22bd0e37b6a6a0b9286bb1621d3bad1.
See the [readiness report](../reviews/assessment-readiness-19246132-2026-11-02.md)
and [CI evidence](../reviews/assessment-ci-evidence-19246132-2026-11-02.md).

| Status | Meaning |
|---|---|
| **PASS** | The item is present and recorded evidence supports it at the stated scope. |
| **PARTIAL** | The item exists, but an identified requirement or access step remains open. |

| Required Section 8 item | Path | Status | Evidence / owner action |
|---|---|---|---|
| 1. Source repository | Private GitHub repository; `codex/assessment-mvp` | **PARTIAL** | Repository and exact SHA are confirmed. Owner must confirm read access for the named evaluator or prepare an approved private handoff; evaluator identity/access is unverified. |
| 2. README setup/run | `README.md`, `docs/operations.md` | **PASS** | On a clean worktree at the live SHA, `npm ci`, isolated Compose database startup, all three migrations, synthetic seed, and one successful API/Web image build completed. Both containers reported `healthy`; API readiness and Web root returned HTTP 200. A first transient BuildKit `ECONNRESET` is retained in the report; the unchanged-candidate retry passed. |
| 3. Architecture diagram | `docs/architecture.md` | **PASS** | Components, request/data flow, persistence, and hosted topology are documented. |
| 4. Data model and key indexes | `docs/data-model.md` | **PASS** | Entities, tenant relationships, constraints, and indexes are documented. |
| 5. API documentation/examples | `docs/api.md` | **PASS** | Routes, authentication expectations, and request/response examples are documented. |
| 6. Sample credentials or seed instructions | `docs/demo-accounts.md`, `api/prisma/seed.ts` | **PASS** | Synthetic local-only accounts and guarded seed instructions are documented; no hosted credentials are included. |
| 7. Test instructions/results | `docs/testing.md`, acceptance ledger, current readiness report, [exact-SHA CI evidence](../reviews/assessment-ci-evidence-19246132-2026-11-02.md) | **PASS** | Actions #130 ran the API, Web, and Playwright gates on the exact SHA. The CI record links the run artifact and summarizes commands and counts. The readiness report contains local Compose startup, migration, and seed results. A separate local rehearsal file was not found; its results are not claimed. |
| 8. Tradeoffs/limitations/next steps | `docs/limitations.md` | **PASS** | Known limits and future work are documented. |

Section 8 marks deployment URL and CI as optional. Internal acceptance gates
are in the [acceptance ledger](acceptance-status.md), not counted as extra
deliverables.

Earlier inventory snapshots are in the
[history archive](../history/2026-11-02/README.md).
