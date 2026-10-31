# Preview reopen verification — run #29 evidence head

- Date/time: 2026-10-31, approximately 14:07–14:08 Asia/Calcutta (08:37–08:38 UTC).
- Git evidence head: `770bfaac575b9d4b3aaf2abdabec294d7273e1b6`; application source deployed by Vercel remains `7c2fdba6efb7c39dbf723f100644a5c53928fd84`. Vercel Web/API checks for the docs head are success.
- Surface: authenticated Vercel Preview branch alias `customer-support-platfo-git-f28eab-arunkumars-projects-67bc2fdd.vercel.app`; Preview synthetic administrator session.
- Fixture: synthetic ticket #6, ID `42cf080f-7f1b-4846-8124-3ff6584ff384`, previously Resolved.

## Action and observed UI result

1. Selected In Progress and entered the reopen reason “Preview reopen verification 770bfaa run 29.”
2. The application displayed “Ticket updated.”, showed ticket status In Progress, and rendered a Status changed activity item containing the reopen reason. This observed result is consistent with a successful mutation and resolves the prior UI-state ambiguity for this retry.
3. Returned the synthetic ticket to Resolved; the UI again displayed “Ticket updated.” and showed the restore event.

## Request/response capture limit

The authenticated browser tool available in this session exposes DOM and screenshot state but no network event/HAR API. Its evaluation sandbox also does not expose fetch or performance APIs. Vercel runtime logs showed no per-request status record. Source inspection shows the client sends PATCH `/api/tickets/{ticketId}` with organization, CSRF, and ticket-version headers and a payload including `reopenReason`; the Express route returns JSON with its default success status after the update. This source behavior is not a captured wire response. Therefore the raw request body, response body, and numeric HTTP status are **NOT_CAPTURED**. Do not report an observed 200.

## Disposition

- Preview UI reopen: PASS for the observed resulting state and activity event on this retry.
- Raw HTTP response proof: NOT_CAPTURED.
- Ticket fixture was restored to Resolved. Only synthetic Preview data changed; Production was untouched.
- Agent/customer journeys and foreign-ticket denial remain blocked by unavailable safe role credentials and absent verified second-tenant fixture.
