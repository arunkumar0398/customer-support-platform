# Assessment requirements and assumptions

This document separates requirements from the employer assessment PDF (`reference/assessment.pdf`) from implementation decisions selected for this project. The PDF remains authoritative if a conflict is found. All implementation status is tracked in [the acceptance ledger](../evidence/checkpoints/acceptance-status.md); unexecuted checks stay `NOT_RUN`.

## Employer requirements and project assumptions

| Topic | Employer requirement | Project decision / assumption |
|---|---|---|
| Product | Multi-tenant customer support system with admins, agents, and customers | One shared PostgreSQL schema with tenant ownership on every tenant-owned record |
| Authentication | Secure authentication and role-appropriate access | Password hashes and opaque, server-side sessions; no public self-signup; synthetic seeded accounts |
| Tenant access | Users must not access another organization's records | Current membership selects the active organization and role; server derives scope from it on each request |
| Customer access | Customers use support tickets | Customer can see their own tickets and edit title/description while a ticket is `OPEN`; only staff controls assignment, priority, and status |
| Agent access | Agents work support tickets | Agent can work tickets within their current organization; customer ownership remains restricted |
| Ticket behavior | Create, discover, update, assign, and discuss tickets | Customers create for themselves; admins/agents may create on behalf of an eligible same-organization customer. Ticket status, priority, ownership, and allowed transitions are fixed below; disallowed transitions return a validation error |
| Audit/history | Meaningful change history | Mutations and immutable activity events commit in one transaction; comments and events are append-only |
| Scale | Discuss growth and large ticket volumes | MVP uses capped offset pagination and tenant-first indexes; cursor pagination is the documented growth path |
| Hosting | Explain hosting and operations; live deployment is optional | Docker-local PostgreSQL is mandatory; Vercel plus Neon is the planned hosted shape and requires separate approval |
| Notifications | Explain integration behavior; sender is optional/stretch | No outbound sender in the MVP; document an outbox, retry, and operator recovery contract |
| Delivery evidence | Provide working source, tests, setup, architecture, data model, API, seed, limitations, and disclosure | Each acceptance result remains `NOT_RUN` until executed evidence identifies command, exit code, environment, and SHA |

## Role and permission matrix

The role comes from a current organization membership, not a global user field or client-provided claim.

| Capability | Admin | Agent | Customer |
|---|---|---|---|
| View tickets in active organization | All | Organization tickets allowed by policy | Own tickets only |
| Create a ticket | Yes, may choose an eligible same-org customer requester | Yes, may choose an eligible same-org customer requester | Yes, requester is the signed-in user |
| Edit title and description | Yes | Yes | Own ticket while `OPEN` |
| Change status, priority, or assignee | Yes | Yes | No |
| Assign to an eligible organization member | Yes | Yes | No |
| Comment and view history | Non-closed tickets | Non-closed tickets | Own non-closed tickets |
| View dashboard | Yes | Yes | No |
| Manage organization memberships and roles | Own organization | No | No |
| Remove or demote the last active admin | No | No | No |

For records outside a caller's visibility, return a non-disclosing not-found response. Admin controls are organization-scoped. The UI may hide controls, but the API enforces every permission.

## Tenant boundary

Users may hold memberships in multiple organizations. A request may identify the organization the user wants to act in, but authentication middleware must reload the current session and validate a current membership for that organization. The resulting membership supplies `organizationId` and `role` for the request context. Client-supplied tenant IDs, user IDs, roles, or session claims never confer authority.

Every tenant-owned query, update, aggregate, filter, search, assignment, comment, event, and relationship is scoped to the validated organization. Ticket requester, assignee, comment, activity, and membership links must not cross organizations. On create, the customer requester is derived from the authenticated customer membership. An admin or agent may supply `requesterUserId` only on the create endpoint; the service verifies an active `CUSTOMER` membership for that user in the active organization. Customers cannot choose a requester, and requester changes on all other operations are rejected. The service checks authorization and the schema enforces same-organization references where practical. PostgreSQL row-level security may be evaluated as defense in depth but does not replace API checks.

## Ticket lifecycle

Statuses are `OPEN`, `IN_PROGRESS`, `RESOLVED`, and `CLOSED`. Allowed transitions:

- `OPEN` → `IN_PROGRESS`
- `OPEN` → `RESOLVED` for quick resolution
- `IN_PROGRESS` → `RESOLVED`
- `RESOLVED` → `IN_PROGRESS` with a required reason recorded in the activity event
- `RESOLVED` → `CLOSED`

`CLOSED` is final. Priority is `LOW`, `MEDIUM`, `HIGH`, or `URGENT`, default `MEDIUM`. Every meaningful mutation increments a ticket version and appends an immutable event in the same transaction. A stale expected version returns `409` and adds no event. Duplicate creation idempotency remains optional and must be reported honestly if not implemented.

## Dashboard definitions

Each dashboard response captures one UTC `evaluationTime`. Counts are scoped to the selected organization. Status and priority counts include organization tickets visible to the requesting staff role. An overdue ticket has `dueAt < evaluationTime` and a status other than `RESOLVED` or `CLOSED`. Agent workload counts assigned `OPEN` and `IN_PROGRESS` tickets. Any due-time/SLA values are illustrative project assumptions, not employer-mandated policy, and must be deterministic in the seed and asserted by tests.

## Notification integration and failure behavior

The MVP has no email or external notification provider. When one is added, the ticket transaction writes an outbox event with the ticket mutation. A worker delivers it asynchronously using bounded exponential retries, a provider idempotency key, and timeouts. A valid ticket mutation does not roll back because a provider is unavailable. After retry exhaustion, the event is marked terminally failed, alerted for operator review, and can be safely retried or redriven from the outbox. Delivery attempts, provider response class, next retry, and terminal failure are observable without logging secrets or message content. This is design-only until a provider and worker exist.

## Deferred and optional scope

Live Vercel/Neon deployment, notification sending, attachments, realtime updates, advanced analytics, microservices, managed cache, and an observability dashboard are outside the initial local MVP. A30 duplicate-request idempotency is conditional in the assessment plan. Any deviation that changes security, data integrity, or acceptance scope requires a reviewed ADR and updated evidence.
