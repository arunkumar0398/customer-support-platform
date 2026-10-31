# Route-wide accessibility remediation — 2026-10-31

- Candidate base commit: `770bfaac575b9d4b3aaf2abdabec294d7273e1b6`; scan ran against the modified working tree before commit.
- Scanner: axe-core 4.11.1 with WCAG 2.0/2.1/2.2 A/AA tags.
- Coverage: **32 scans** total: the same **28 distinct role/route/viewport combinations** listed in the original report, plus four clearly marked repeat scans. Viewports were 1280px and 375px. Roles were Admin, Agent, Customer, and signed out.
- Result: **PASS — zero violations across all 32 scans** (0 scans with findings).
- The prior failure was resolved by darkening the low-contrast muted text colors, including the activity timestamp, and making the dashboard workload table a labeled keyboard-focusable region with enough width to scroll horizontally on mobile.
- The dashboard browser regression test also passed: at 375px, the region receives focus and ArrowRight changes its horizontal scroll position.
- axe reported 14 incomplete/manual checks in total. They are not passes; manual screen reader, error/loading/empty/conflict states, broader keyboard sequences, reduced motion, and full conformance remain outside this scanner result.
- Data: synthetic users/ticket were created and cleaned up in a verified disposable local PostgreSQL test database. No Preview or Production data was changed. The temporary scanner spec and axe installation are not part of the repository.
- The earlier failing report remains preserved at [route-wide-a11y-2026-10-31.md](route-wide-a11y-2026-10-31.md); the full sanitized rerun results are in [JSON](route-wide-a11y-2026-10-31-rerun.json).
