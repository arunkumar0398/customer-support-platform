# Multi-Tenant Customer Support Platform — Design

**Status:** Approved by project owner on 2026-10-26
**Source contract:** `reference/assessment.pdf`
**Baseline:** secure Docker-local MVP first; hosted deployment is a later optional stage.

## Goals and scope

Deliver the assessment's required working vertical slice: sign-in, organization-aware authorization, ticket creation/listing/filtering/detail/update, persistent storage, a minimal dashboard, basic automated tests, and a local Docker setup. Include comments, assignment, and meaningful activity history because they are explicit functional requirements. Provide the required setup, architecture, distinct data-model/indexes, API, seed, test, and limitations documentation. State assumptions and gaps openly.

Do not treat Vercel/Neon hosting, CI, notifications, attachments, richer analytics, or an observability dashboard as prerequisites for the local MVP. The planned hosted target is two Vercel projects with Neon, only after local release gates pass and deployment is separately authorized. Notifications remain a designed future integration, not an MVP sender.

## Delivery approach

Use the assessment's simplest defensible path: build and verify one local vertical slice before optional hosted work. A feature-first parallel build would create more integration and tenant-security risk; a cloud-first build would add provider configuration before the required local product works. The application is a modular monolith, not microservices.

## Architecture and stack

- TypeScript throughout; npm workspaces at the repository root.
- `web/`: React + Vite application with React Router, TanStack Query, and Tailwind.
- `api/`: Express REST API under `/api`, Zod request validation, Prisma data access, and PostgreSQL.
- `api/index.ts` exports the Express app for the future Vercel Node Function. A separate `api/src/local-server.ts` owns local `listen()` startup.
- Local PostgreSQL runs through Docker Compose. Use separate development and disposable test database identities; tests must verify their target before destructive setup.
- Vitest/Supertest cover unit and API behavior; real PostgreSQL integration tests cover constraints, tenant boundaries, and transactions; Playwright covers the required browser journeys.
- GitHub Actions and hosted Vercel/Neon configuration are later deliverables. No hosted code path may weaken local security behavior.

## Roles, membership, and tenant boundary

Roles belong to an organization membership, not to a global user record. A user may belong to multiple organizations. The client may request an active organization selector, but the server validates that the authenticated user has a current membership there and derives role and organization scope from that membership. Session claims or client-supplied `organizationId` never grant authority.

| Capability | Admin | Agent | Customer |
|---|---|---|---|
| View tickets in active organization | All | All permitted organization tickets | Own tickets only |
| Create ticket | Yes; may select an eligible same-org customer requester | Yes; may select an eligible same-org customer requester | Yes; requester is the signed-in customer |
| Edit ticket title/description | Yes | Yes | Own ticket while OPEN (design assumption) |
| Change status/priority/assignee | Yes | Yes | No |
| Assign ticket | Yes | Yes, to an eligible member of same organization | No |
| Comment/read history | Visible non-closed tickets | Visible non-closed tickets | Own non-closed tickets |
| View dashboard | Yes | Yes | No |
| Manage memberships and roles through the API and UI | Yes, own organization only | No | No |

The last active organization admin cannot be removed or demoted. Return a non-disclosing not-found response for records outside the caller's visibility. Every organization-owned read, write, aggregate, search, comment, history, and assignment query is scoped by the validated organization and then by role/ownership. Enforce same-organization relationships in both service logic and database constraints where practical. Seed two organizations and include foreign-organization and same-organization/different-customer fixtures.

## Authentication and request protection

Use password hashes and persistent opaque server-side sessions; store only a hash of the session token. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Unsafe requests require same-origin validation plus a CSRF defense suitable for cookie authentication. Re-check the current session and membership on protected requests so expiry, revocation, or role changes take effect. Rate-limit login. Never log passwords, session values, or database connection strings. No public self-signup is in scope; seeded demo accounts provide repeatable access.

No outbound integration is required for the local MVP. Document the future notification delivery contract: persist an outbox event with the ticket transaction, deliver asynchronously with bounded retries and idempotency, surface terminal failure for operator recovery, and do not roll back a valid ticket mutation because an external provider is unavailable. Record timeout, retry, duplicate, and recovery behavior as design-only until a provider exists.

## Data model and query behavior

Use PostgreSQL shared schema with `Organization`, `User`, `Membership`, `Session`, `Ticket`, `Comment`, and append-only `ActivityEvent`. Tenant-owned rows carry `organizationId`. Membership is unique by `(organizationId, userId)`. Ticket numbers are unique within an organization. Ticket requester, assignee, comment, and event relationships must not permit cross-organization linkage. Store status, priority, timestamps, and a monotonically increasing ticket version. Secrets are password hashes only.

Use tenant-first indexes for ticket listing and common status/priority/assignee/requester filters; index comments and events by `(organizationId, ticketId, createdAt, id)`. Paginate with a bounded page size and deterministic `createdAt DESC, id DESC` order. MVP may use bounded offset pagination; document a cursor-based growth path. Keep search tenant-scoped and bounded, document its query plan, and use `EXPLAIN` evidence for a representative filter before release.

## Ticket rules, audit, and dashboard

Statuses are `OPEN`, `IN_PROGRESS`, `RESOLVED`, and `CLOSED`. Allowed transitions are `OPEN → IN_PROGRESS`, `OPEN → RESOLVED`, `IN_PROGRESS → RESOLVED`, `RESOLVED → IN_PROGRESS`, and `RESOLVED → CLOSED`; `CLOSED` is final in the MVP. The reopen transition requires a reason captured in the event. Priority is `LOW`, `MEDIUM`, `HIGH`, or `URGENT`, defaulting to `MEDIUM`. Due-time policy is an explicitly illustrative SLA assumption, not an assessment rule.

Each meaningful ticket mutation and its immutable activity event commit in the same database transaction. Updates compare the expected version and increment it atomically; stale writes return HTTP 409 and do not create an event. Comments are append-only and ordered deterministically. Duplicate ticket creation may use an idempotency key if it fits the MVP; if omitted, document the behavior and mitigation rather than marking it complete.

Dashboard queries always use active organization scope. Status and priority counts reflect visible organization tickets; overdue means `dueAt < evaluationTime` for tickets not `RESOLVED` or `CLOSED`; agent workload is assigned `OPEN` plus `IN_PROGRESS` tickets. Record one UTC evaluation time per response and make formulas explicit in documentation and fixture-based tests.

## Frontend behavior

Provide sign-in, ticket list/search/filter, create ticket, ticket detail/edit/comments/history, a simple dashboard, and admin membership controls. Support narrow and desktop viewports, keyboard navigation, semantic labels, visible field errors, and loading, empty, error, denied, not-found, and stale-conflict states. Server authorization remains authoritative; client-side visibility is not a security boundary.

## API and errors

Expose documented JSON endpoints for login/logout/current user, memberships, tickets, assignments, comments, activity history, dashboard, and health/readiness. Use strict request allowlists and reject unauthorized fields such as `organizationId`, role, password hash, and client-supplied internal version. Use consistent error envelopes with request IDs and appropriate 400/401/403/404/409/422/429/500 status codes. Unexpected errors do not expose stack traces or secrets. Structured logs must redact credentials and customer-sensitive values.

For ticket creation, customers cannot choose a requester: the server derives it from the authenticated customer membership and rejects a supplied requester field. Admins and agents may set an explicit `requesterUserId` only on create; the service verifies that the selected user has an active `CUSTOMER` membership in the active organization. On every other role/operation, requester changes are rejected. This is a narrowly allowlisted staff workflow, not general client authority to impersonate users.

## Required evidence and release gates

Map every acceptance ID A01–A40 to an executable test, documentation item, or justified optional/not-applicable status. Report all checks as `NOT_RUN` until actually executed. G0 covers install, lint/format, typecheck, and build; G1 database/migrations/seed; G2 authorization negatives; G3 API behavior; G4 browser journeys; G5 local release readiness. G6 hosted preview is optional and requires separate human authorization. G7 is independent review. A kit-integrity pass is not an application gate pass.

The local MVP is ready only when the clean Docker setup, required journeys, security-negative tests, persistent database behavior, documentation, and applicable gates have real evidence on the reviewed commit. Preserve exact command, exit code, environment, SHA, and sanitized output. Stop on P0/P1 defects or missing tenant-boundary proof.

## Assumptions and unresolved details

These are selected design defaults, not requirements stated verbatim by the employer:

1. Shared PostgreSQL schema with membership-based `ADMIN`, `AGENT`, and `CUSTOMER` roles.
2. Agents may see all tickets in their active organization; customers may see only their own.
3. Customers may edit their own ticket's title/description only while it is `OPEN`; only staff change assignment, priority, and status.
4. `CLOSED` is final; only `RESOLVED` tickets may reopen to `IN_PROGRESS`, with a reason.
5. Illustrative priority-based due times are used only if needed to demonstrate overdue metrics and are clearly labeled as assumptions.
6. Offset pagination is acceptable for the assessment-sized MVP when capped and deterministic; cursor pagination is the documented scale path.
7. Idempotency is stretch within the local MVP; concurrency protection and atomic audit writes are required to make simultaneous edits defensible.
8. Live deployment is optional; preview and production databases must be separate if deployment is later approved.

No architectural decision requires a blocking clarification given the supplied master prompt and harness defaults. Revise this design if the PDF or implementation evidence contradicts it.
