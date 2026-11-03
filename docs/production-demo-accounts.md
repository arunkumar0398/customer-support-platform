# Optional Production demo accounts

This is an optional, owner-operated demo feature. The assessment does not require persistent Production accounts: Section 8 accepts sample credentials **or** seed instructions, already provided by the guarded local workflow in [`demo-accounts.md`](./demo-accounts.md). This CLI is not a signup endpoint, migration, CI job, general-purpose seeder, or hosted acceptance harness.

## Current status

**Production provisioning: BLOCKED / NOT_RUN.** The code-owned target profile pins the Production Neon project, primary branch, direct endpoint, and database. Its required role is `production_demo_provisioner`; read-only console inspection showed only `neondb_owner`, which is intentionally not accepted. The API runtime database binding and the Web-to-API Production pairing also remain unverified. This guide does not authorize a Production request or write.

The fixed identity is in `api/scripts/production-demo/profile.ts`. Command-line identity flags must exactly match it. The verifier also checks the endpoint-to-project/branch mapping with a read-only Neon API request and checks the connected PostgreSQL database and role. A branch label or health response alone does not prove the runtime environment. Do not edit the profile to make Preview or an unknown target pass.

## Owner prerequisites

Before a separately approved Production run, the repository owner must privately confirm:

- immutable Production Web/API deployments and SHAs, with the Web destination verified;
- the API's runtime Neon project, branch, endpoint, database, and least-privilege role;
- that the dedicated synthetic tenant and run ID are unused and collision-free;
- the operator, private credential destination, evaluator delivery method, access-review cadence, rotation owner, and retirement owner;
- the exact permitted role journeys and recovery procedure for an uncertain database commit.

The operator must obtain a direct PostgreSQL URL for the approved endpoint and a Neon API key with read-only endpoint-inspection access. Provide both through an approved private secret-handling method in the operator process environment. Never put them in command arguments, repository files, terminal transcripts, CI, screenshots, chat, or PR text. The command refuses CI and hosted build environments.

Create a new, empty credential directory outside the repository. It must be owned by the operator and private to that operator: owner-only permissions on Unix, or an ACL restricted to the operator, SYSTEM, and Administrators on Windows. Do not use a shared or synced folder. Preserve the directory for the account owner's credential-custody process. Provisioning requires both standard input and standard output to be attached to an interactive terminal; verification-only can run noninteractively.

## Provision once

From `api/`, use the exact non-secret target flags in the code-owned profile and a new run ID beginning with `demo-`:

```sh
npm run demo:production:provision -- \
  --mode production \
  --project-id <production-project-id> \
  --branch-id <production-primary-branch-id> \
  --endpoint-id <production-direct-endpoint-id> \
  --database <production-database-name> \
  --username <dedicated-provisioner-role> \
  --run-id demo-evaluator-<unique-suffix> \
  --credential-dir <absolute-empty-private-directory>
```

After the target is verified, the operator must type the exact Production project ID and run ID shown in the confirmation prompt. The command creates one synthetic organization with an organization-scoped admin, an agent, two customers, and synthetic tickets in one transaction. It generates a distinct high-entropy password per account and hashes each with the application's existing password-hashing implementation. Output includes only target identity, record counts, and private file paths; passwords and hashes are never printed.

The CLI itself accepts only its fixed Production target, so tests never execute it against a database. Rehearse the verifier and provisioning service through the test harness against the identity-verified disposable local `support_test` database. Do not point automated tests at Preview or Production.

## Verify an existing run without changing it

Use the same exact target flags, run ID, private directory, and process environment, adding `--verify-existing`:

```sh
npm run demo:production:provision -- \
  --mode production \
  --project-id <production-project-id> \
  --branch-id <production-primary-branch-id> \
  --endpoint-id <production-direct-endpoint-id> \
  --database <production-database-name> \
  --username <dedicated-provisioner-role> \
  --run-id demo-evaluator-<unique-suffix> \
  --credential-dir <existing-private-run-directory> \
  --verify-existing
```

This reads only the exact run's sanitized manifest from the private directory and compares the persisted organization, all memberships held by the four run accounts, tickets, and activity. It creates no files, emits no credentials, changes no passwords or memberships, and performs no cleanup. A normal provisioning retry for an existing run ID fails closed; use this verification-only operation to check the existing run. If the private manifest is missing or persisted records differ, stop and reconcile read-only with the owner before taking action.

## Persistent lifecycle and recovery

Accounts persist; this command has no automatic expiry or cleanup. Deliver one-time credentials only through the owner-approved private evaluator channel. The repository owner must periodically review access and explicitly decide when to rotate or retire the synthetic tenant. Rotation, account recovery, and retirement are separate reviewed operations; this command cannot recreate a lost password or delete persistent records.

If the CLI reports an uncertain `COMMIT` or rollback, do not retry provisioning, remove the private files, or delete database rows. Preserve the private credentials and sanitized manifest. The named owner/operator must reconcile the exact run through an approved read-only check before a separately reviewed recovery action. A confirmed pre-write failure or rollback may remove only the exact private files created by that command; if removal cannot be verified, preserve them for reconciliation.

## Evidence limits

Provider success, health/readiness, and a Neon console connection do not prove the deployed API's runtime database identity, the Web-to-API binding, authenticated role journeys, or tenant isolation. Record later results against the exact deployments and source SHAs, keeping provider status, readiness, and authenticated acceptance separate.
