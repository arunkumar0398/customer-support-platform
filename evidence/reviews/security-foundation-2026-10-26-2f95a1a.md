# Independent security/code review — auth and policy foundation

Recorded by the builder from the separate read-only `/root/design_check` review. The reviewer used the supplied sibling assessment review skill, playbook, and threat map. This report is preserved evidence, not an executed product test.

- Reviewed clean evidence HEAD: `3ca8bb30cb209fa177d6fa3c35f4a1a436902fd3`.
- Latest source SHA: `2f95a1ad85d5b599ce1cd378d60dfe946a3dd3e0`.
- Branch: `codex/assessment-mvp`.
- Scope: TK-07–TK-10 HTTP errors/validation, authentication/session/CSRF, current active membership, and central role/ownership/query policies.
- Independence: separate agent from the builder and checkpoint/spec reviewer. Read-only source inspection; no files changed, tests executed, or database connection made by this reviewer. Parent results are separately recorded in the task checkpoints.

## Verdict

No P0/P1 issue found. The foundation may advance to local TK-11 implementation. This is not a release, acceptance, or G2 pass. One non-blocking P2 availability concern remains open.

## SEC-FOUNDATION-01 — P2 / LIKELY / OPEN

**Location:** `api/src/modules/auth/routes.ts`, `loginThrottle` full-map handling.

**Concern:** the 4,096-entry process-local limiter removes expired entries and rejects a new key with 429 while the map remains full. Sufficient distinct source IP/account keys can consume the table and cause unrelated new legitimate keys to receive 429 until expiry. Capacity is bounded intentionally, but the fail-closed policy has an availability tradeoff.

**Reproducer proposed by reviewer:** in an expressly disposable test environment, fill the map with distinct source IP/account keys within one window, then attempt a new legitimate key; observe 429. Advance beyond expiry and verify recovery. This exhaustion/recovery probe has **NOT_RUN**; the risk is supported by static control-flow inspection, not a demonstrated production event. The existing per-account/IP and time-window tests do not claim map-exhaustion coverage.

**Scope/disposition:** non-blocking for the current local single-process milestone; proxy/replica/serverless limits were already disclosed. Track A33 and TK-30 for an exhaustion/recovery test and availability disposition. Before public/serverless exposure, use a vetted shared/provider limiter and verify its overload behavior; do not silently evict security keys and claim equivalent brute-force protection. No deployment is authorized by this finding or report.

## Other inspected boundaries

The reviewer found no source issue in random opaque/hash-only persisted sessions, expiry/revocation and rotation, exact-origin plus session-bound CSRF, cookie flags, current membership-derived organization/role, customer ownership, mandatory query predicates, server request IDs, sanitized errors/logs, or strict top-level validation. Test-only context routes are absent from the product app. These are code-inspection observations; complete product-route, PostgreSQL/browser replay by an independent reviewer, and release gates remain pending.
