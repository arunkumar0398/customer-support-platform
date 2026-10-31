# Ticket create and reopen UI design

Date: 2026-10-31  
Approval: User selected the staff-only customer lookup option.

## Contract

The assessment PDF requires customer ticket creation, staff ticket work, lifecycle updates, responsive usable UI, validation, and server-enforced tenant isolation. The approved design further requires staff-created tickets to name an active customer membership in the active organization and requires a reason when a resolved ticket is reopened.

## Design

- Add `GET /api/tickets/requesters`, behind authentication and active-membership middleware. Only ADMIN and AGENT may call it. Return active CUSTOMER memberships for the current organization, ordered by email, with only `{ userId, email }` fields. Never accept an organization ID from the query as authority.
- Replace the staff create form's raw UUID input with a required accessible customer select backed by this endpoint. Include loading, error, and empty states. The create API remains the authority and continues validating the submitted ID.
- When a staff user changes a ticket from RESOLVED to IN_PROGRESS, show a required reason field. Include its trimmed value as `reopenReason`; hide it for other transitions. The existing API remains authoritative and persists the reason in the status event.
- No schema or deployment changes are needed.

## Security and UX

Customers cannot call the lookup endpoint. Lookup results are scoped by the server's current membership and expose no role, activity metadata, organization identifiers, or inactive customer accounts. The form is keyboard-operable, labelled, and reports query errors and empty results accessibly. Reopen validation blocks blank/whitespace-only reasons before a request, while server validation remains in force.

## Acceptance

API tests prove staff access, customer denial, organization scoping, active-customer filtering, and field minimization. Browser tests prove the human-readable selection creates a ticket for the chosen customer and that reopening requires/sends a reason and persists the resulting status event. Existing tenant checks and lifecycle rules remain unchanged.
