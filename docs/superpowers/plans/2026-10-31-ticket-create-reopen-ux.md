# Ticket create and reopen UX implementation plan

Design: `docs/superpowers/specs/2026-10-31-ticket-create-reopen-ux-design.md` (approved 2026-10-31).

1. Add API requester lookup regression cases to `api/tests/tickets/create.test.ts`: admin and agent receive only active current-org customer `{userId,email}` options; another-org customers and inactive/non-customer memberships are excluded; customer receives 403. Run guarded API suite to observe RED.
2. Implement scoped lookup service and `GET /requesters` route in `api/src/modules/tickets/service.ts` and `routes.ts`; run focused API test and observe GREEN.
3. Add web requester lookup API type/client and browser regressions in `web/src/lib/api.ts`, `web/tests/e2e/ticket-create.spec.ts`: replace raw ID with accessible picker and assert selection reaches create payload and detail/queue; test no raw UUID field remains.
4. Add reopen browser regression in `web/tests/e2e/ticket-detail.spec.ts`: on a RESOLVED fixture select IN_PROGRESS, require nonblank reason, assert no write for blank reason, then save and assert the event has the reason. Run focused browser tests to observe RED before implementation.
5. Implement picker loading/error/empty states in `web/src/features/tickets/create/TicketCreatePage.tsx`; implement conditional reason state, validation and payload in `web/src/features/tickets/detail/TicketDetailPage.tsx`. Run focused browser tests, full checks and exact-candidate Docker startup.
6. Record sanitized exact-SHA evidence in `evidence/checkpoints/TK-25.md` follow-up and reconcile the acceptance ledger/handoff; independent parent-kit review follows on the resulting SHA.

## Gates

- API tests must use the guarded disposable `support_test` DB. Never use Preview or Production for test fixtures.
- Browser tests may write only after test DB identity verification in `beforeAll`.
- No preview account/password is guessed. No Preview/Production data mutation is part of this UI change.
- Preserve the ten existing modified TK-29 screenshot files.
