# ADR 0001: Shared PostgreSQL schema and membership-based RBAC

**Status:** Accepted for the local MVP design; implementation must be verified by TK-04 onward.

**Date:** 2026-10-26

## Context

The assessment requires multiple organizations, admin/agent/customer roles, ticket ownership, assignment, and verifiable cross-organization isolation. The product also needs a repeatable local setup and a small enough operational footprint for an assessment MVP. A tenant database per organization or multiple services would increase provisioning and test complexity without improving the required proof by itself.

## Decision

Use one PostgreSQL database schema with `organizationId` on every tenant-owned entity. Roles belong to a `(organizationId, userId)` membership; a user may have different memberships in multiple organizations. Each request revalidates the current session and membership, then derives organization and role server-side. Tenant-scoped service predicates and composite foreign keys enforce separation at the application and relational layers. Development and test environments use separate databases and login roles.

PostgreSQL row-level security is not a substitute for request authorization. It may be considered as additional defense only after a transaction-safe session context and its pool behavior are designed and tested.

## Consequences

- One Compose service and one migration stream support development and integration testing.
- Shared tables require disciplined tenant predicates on every query, aggregate, search, relation, and mutation.
- Composite foreign keys and tenant-first indexes add schema work but prevent cross-organization references and support common access paths.
- Cross-organization negative integration tests are a release requirement; unit mocks alone are insufficient.
- The security boundary remains testable on the same topology intended for a Neon deployment.
- Database-per-tenant isolation and row-level security remain possible future choices if measured compliance or isolation requirements justify the added operational complexity.

## Acceptance impact

Primary evidence is expected from A03–A09, A25, A31–A33, and A38 through the schema, authorization, and database test tasks. This ADR records a decision only; it does not mark any acceptance ID as passed. All results remain `NOT_RUN` until the evidence ledger is updated from executed tests.
