# Route-wide accessibility review — 2026-10-31

- Application source: `7c2fdba6efb7c39dbf723f100644a5c53928fd84` (current at evidence head `770bfaac575b9d4b3aaf2abdabec294d7273e1b6`).
- Method: axe-core 4.11.1 using WCAG 2.0/2.1/2.2 A/AA tags; isolated Playwright UI against a fresh local disposable PostgreSQL test DB and synthetic role fixtures.
- Coverage: 32 route/role/viewport scans at 1280px and 375px: sign-in; ticket queue, dashboard, create, and detail for Admin, Agent, Customer; Admin membership roster. The customer dashboard was also checked by direct route.
- Scanner result: **FAIL** — 32 serious color-contrast rule findings and 2 serious keyboard-access findings. Counts include repeated observations across role/viewport combinations. See sanitized, target-level [JSON results](route-wide-a11y-2026-10-31.json).

## Findings

1. **Text contrast is below WCAG AA 4.5:1 across all routes.** Repeated low-contrast tokens affect sign-in supporting text, queue and dashboard metadata/table headings, create hints, ticket detail metadata, and membership labels/policy copy. Measured ratios include 3.23:1 (#829089 on #fbfcf9), 3.42:1 (#75877e on #f1f4ef), 3.64:1 (#71827c on #f1f4ef), and 4.48:1 (#64736e on #f1f4ef). These are small/normal text, so 4.5:1 applies. Remediate shared text tokens and re-scan all routes.
2. **Mobile dashboard table is not keyboard-scrollable.** axe reports `scrollable-region-focusable` on `.dashboard-table-wrap` at 375px for Admin and Agent. Add a keyboard-focusable region with an accessible name and verify keyboard scrolling.

## Coverage limits

- axe returned incomplete checks for manual assessment on sign-in and dashboard; these are preserved as `incomplete` entries in the JSON and are not treated as passes.
- This scan covers rendered default route states only. It does not certify screen-reader behavior, validation/error/loading/conflict states, all keyboard sequences, reduced motion, or a full WCAG conformance claim. Existing focused sign-in and membership focus tests remain separate evidence.
- No Preview or Production data changed. Synthetic fixtures were created and removed from the disposable local test database. The ten user-modified TK-29 screenshots were not written by this scanner.

## Disposition

A37 is **FAIL** on this candidate until contrast and mobile keyboard scrolling are fixed and rerun. Hold release and final independent review until remediation and verification.
