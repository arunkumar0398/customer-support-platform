# Production Synthetic Demo Accounts — Design

## Status and scope

**Status:** approved for isolated PR implementation; Production execution is not approved by this document.

This is an optional owner-requested Production demo capability. The assessment PDF's Section 8 deliverable already accepts sample credentials **or** seed instructions, and [`docs/demo-accounts.md`](../../demo-accounts.md) documents the guarded local seed. This work does not change that assessment requirement.

The feature will provide one operator-run, one-off provisioning command for a persistent synthetic tenant. It will have no HTTP route, public signup, CI invocation, or migration. No Production request or write will be made while implementing or testing this PR.

## Account lifecycle

The requested lifecycle is **persistent evaluator demo accounts**. Create one synthetic organization with an organization-scoped administrator, agent, and two customers so the ownership-denial path can be demonstrated. Add a small set of synthetic tickets so each role has a useful starting state. Use unique `example.test` identities tied to an explicit run ID. Never use real people or real customer records.

Accounts do not expire automatically and the provisioning command does not clean them up. The repository owner is responsible for reviewing the account set periodically, securely delivering credentials to the evaluator, rotating them through a separately guarded operation when needed, and retiring the synthetic tenant through a reviewed exact-ownership procedure. If a generated credential file is lost before delivery, the provisioner must refuse to regenerate credentials implicitly; a separately approved rotation is required.

## Proposed mechanism

Implement a narrowly scoped operator CLI under `api/scripts/production-demo/`. It is invoked manually from an owner-controlled local shell and is disabled in CI. The existing local seed remains unchanged and retains its loopback, database-name, role, and connected-identity checks.

The command requires all of the following before opening a database write transaction:

- an explicit Production mode and unique run ID;
- exact expected Neon project, branch, endpoint, database, and database-role identities;
- a direct database URL supplied through a private process environment variable, never an argument, file in the repository, or log;
- a Neon API credential supplied through the private process environment, used only for read-only endpoint-to-project/branch verification and never printed;
- an existing, empty credential destination outside the repository with permissions the tool can verify for the current operator;
- a typed operator confirmation repeating the expected Production project and run ID.

The verifier checks that the URL hostname identifies the expected endpoint, the read-only Neon API response maps that endpoint to the expected project and branch, and a database identity query matches the expected database and role. Missing, ambiguous, Preview, loopback, local, or mismatched targets fail closed. The tool makes no Neon control-plane mutation and does not alter Vercel configuration.

## Synthetic data and tenant boundaries

Provision only the organization and run-owned accounts/tickets listed by the plan. Derive a unique organization slug, account emails, and synthetic ticket labels from the validated run ID; generate fresh UUIDs for database records. Generate a separate high-entropy password for each account at execution time and hash it with the application `hashPassword` implementation. Store plaintext only in a newly created private credential file. Never store plaintext credentials or password hashes in the sanitized manifest, source, logs, screenshots, GitHub, or PR metadata.

All seeded tickets are synthetic. The organization administrator's membership operations and dashboard queries remain constrained to the synthetic organization by the existing application authorization model. The administrator can add an already existing global user to this synthetic organization; that limitation is documented, and the synthetic administrator credential must receive the same private custody and periodic review as other privileged credentials.

## Transaction, idempotency, and recovery

Use one database transaction for organization, users, memberships, sample tickets, and initial activity records. The run-derived organization slug and account emails establish a deterministic run identity without a schema migration. A sanitized manifest in the private destination records the verified target, run ID, generated record IDs, and created counts but contains no credentials or hashes. A duplicate run ID may be treated as a verification-only retry only when the persisted objects match that manifest; it must not alter memberships, overwrite account passwords, or re-emit credentials. Any collision, missing manifest, or partial/mismatched state fails closed.

Create and permission-check the credential file before the transaction. If the database commit result is uncertain, retain the private credentials and sanitized run marker, stop, and require an operator read-only reconciliation before retry. Do not delete records or regenerate passwords during uncertainty. If rollback is confirmed, retain or securely remove the credentials file only through an explicit operator action. Persistent-account retirement is a separate reviewed task and must verify exact run ownership and dependent records before deletion.

## Threat model and non-goals

Protect against accidental writes to local, Preview, wrong-project, wrong-branch, wrong-endpoint, wrong-database, or wrong-role targets; credential leakage; duplicate or partial account creation; run-ID collision; and tenant escape by demo principals.

The command is not a general-purpose production seeder, migration tool, account-recovery endpoint, or hosted acceptance harness. It does not verify that Vercel Web points to the intended API, that the deployed API uses the checked Neon endpoint, or that Production role journeys pass. Those remain separately verified owner-side prerequisites for any hosted execution.

## Production execution gate

Production provisioning and authenticated role tests remain `BLOCKED / NOT_RUN` until the owner records, in a private operator plan:

1. immutable Production Web and API deployment IDs and source SHAs, and verified Web-to-API destination;
2. API runtime database endpoint, project, branch, database, and role match, checked without secret readback;
3. the dedicated synthetic organization/run ID is unused and will not collide with existing customer data;
4. the operator, restrictive credential destination, secure evaluator delivery method, account-review cadence, rotation owner, and retirement owner;
5. the exact records and allowed synthetic-only role journeys, plus a recovery plan for an uncertain transaction.

After a separate exact-scope approval, the owner may run the CLI once, validate the roles only against the synthetic tenant and tickets, and save sanitized evidence. Provider deployment status or health checks do not establish application identity, database binding, or role behavior. This PR does not authorize Production writes, migrations, deployment/configuration changes, or requests against real customer records.

## Verification requirements for the PR

Use disposable local PostgreSQL only. Test target refusal for loopback/local, Preview, unknown, and mismatched project/branch/endpoint/database/role identities; malformed/tampered run state; duplicate run IDs; collisions with existing orgs/users; transaction rollback on injected failure; credential destination outside-repository and permission checks; no secret output; and refusal to overwrite credentials or rotate passwords on verification-only retry.

Exercise provision → login/session → customer ticket create/list/detail/comment → agent assignment/update/respond → admin tenant dashboard/membership behavior → same-tenant-other-customer and cross-tenant denial → exact-run reconciliation/cleanup on the disposable database. Compare persisted ticket, comment, event, membership, user, session, and organization state for denied writes and cleanup. Do not target Preview or Production in automated tests.

## Open owner decisions and limits

- Select the actual Production project/branch/endpoint/database/role values in the private run plan; the repository does not encode secrets or assume local/Preview identities.
- Confirm the Vercel deployment pair and runtime Neon binding privately before execution. The currently observed deployment IDs/source SHAs alone are insufficient.
- Confirm the private credential destination and evaluator delivery channel before generating any Production credentials.
- Set a concrete owner review cadence and secure rotation/retirement procedure before the demo account set is made available.
