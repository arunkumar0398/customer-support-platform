# ADR 0002: Staff-created tickets select a customer requester

**Status:** Accepted as a design clarification before implementation.

**Date:** 2026-10-26

## Context

The role matrix allows admins and agents to create tickets and allows customers to create their own. Requiring every requester to be a customer while also deriving requester identity only from the authenticated user makes the staff creation path contradictory: staff cannot be the requester and cannot select a customer.

## Decision

Customer create requests always use the authenticated customer's active membership as requester; any supplied requester field is rejected. Admins and agents may supply `requesterUserId` only when creating a ticket. The service must verify that the selected user has an active `CUSTOMER` membership in the validated active organization. The API rejects requester changes for every other role or operation. Database composite foreign keys guarantee that requester membership belongs to the ticket organization; service authorization additionally enforces the customer role.

## Consequences

- The staff create form must load eligible customers from the active organization and submit a requester only for staff roles.
- A customer cannot create a ticket for another customer or use a forged requester ID.
- The API schema is role- and operation-specific; `requesterUserId` is a narrow allowlisted field for admin/agent create, not a generally writable ticket property.
- Integration tests must prove valid same-org staff selection, customer self-requester derivation, rejection of customer spoofing, inactive membership rejection, and cross-org requester rejection.

## Acceptance impact

This clarification supports A03, A09, A10, and A11. It does not pass them; they remain `NOT_RUN` until the authorized endpoint and database behavior are exercised with real seeded memberships.
