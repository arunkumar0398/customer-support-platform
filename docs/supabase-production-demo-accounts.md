# Supabase Production demo accounts

## Scope and status

Production demo accounts are optional owner-requested operations work. The local seed instructions in [demo-accounts.md](./demo-accounts.md) already satisfy Section 8’s “sample credentials or seed instructions” item.

This guide documents a guarded operator tool for the dedicated Supabase Production project. **No accounts have been provisioned by this change.** The tool must be reviewed before a separate exact-run approval authorizes any Production write. It does not change Vercel settings, deploy code, migrate data, or modify Neon.

The intended set is persistent and contains:

- Two synthetic organizations: Alpha and Beta.
- Four accounts per organization: one organization admin, one agent, and two customers.
- Two synthetic tickets per organization, one owned by each customer, assigned to that organization’s agent, with a creation activity event.

Account emails use the reserved `example.test` domain. The tool creates no real-person identities, comments, or sessions.

## Pinned target and role

The code pins the Production database host to project ref `ityzntsmumvtktjjdacs`, database `postgres`, direct endpoint `db.ityzntsmumvtktjjdacs.supabase.co`, and login `csp_prod_runtime`. The connection uses TLS certificate validation. Before writing, the verifier checks the connected database and role, safe role attributes and memberships, and the runtime role’s app-table DML grants without schema/database DDL or ownership.

The project region (`ap-northeast-2`) and Supabase branch label (`main / PRODUCTION`) are code-owned target metadata; a database connection cannot independently prove those provider-control-plane facts. The operator must confirm the project ref and region in Supabase before the exact-run approval. Never point Vercel Preview at this Production database.

The provisioner requires a **direct** connection URL for `csp_prod_runtime` in `SUPABASE_PRODUCTION_DIRECT_DATABASE_URL`. It does not accept a URL or target override on the command line. Keep the value in an approved private operator secret mechanism. Do not put it in `.env`, command arguments, shell history, screenshots, logs, GitHub, or chat.

## Before requesting a Production run

The PR containing this tool must be reviewed and accepted first. Then prepare a separate run plan that names:

1. The operator and exact run ID (`prod-demo-YYYYMMDD-xxxxxxxx`). Use a fresh random eight-character lowercase hexadecimal suffix; do not reuse a Preview or prior Production run ID.
2. The owner who will receive the credentials through an approved private channel.
3. The access-review owner and cadence, password-rotation owner, and account-retirement owner. These persistent accounts have no automatic expiry or cleanup.
4. The recovery owner and procedure for an uncertain database commit. The credentials and manifest must be preserved until the exact run is reconciled.
5. The allowed demo actions and confirmation that the two synthetic organizations are the only intended data scope.

Use a new credential directory under the operator’s local, non-synced profile storage, for example `%LOCALAPPDATA%\CustomerSupportPlatform\ProductionDemo\<run-id>`. Its parent must already exist. The tool creates the final directory and files, refuses an existing path, rejects any destination inside the repository, and applies a Windows ACL for the current operator or POSIX owner-only modes. Confirm that local device backup/sync policy is suitable before use.

The plan and review must not include connection strings, passwords, password hashes, tokens, cookies, or credential-file contents.

## Read-only target check

In the API repository root, make the approved secret provider expose `SUPABASE_PRODUCTION_DIRECT_DATABASE_URL` to the current operator process, then run:

```powershell
npm run supabase:production-demo:verify-target
```

The command prints only sanitized target identity. Stop if it fails or the database, host, role, TLS, role flags/memberships, schema privileges, table grants, or type grants differ from the reviewed target policy. Do not substitute `postgres`, `csp_prod_migrator`, a pooler URL, Neon, or any Preview connection.

## Provision after review and exact-run approval

Choose a new run ID and an empty private destination. From the repository root, run:

```powershell
npm run supabase:production-demo:provision -- --run-id prod-demo-YYYYMMDD-xxxxxxxx --output-dir "$env:LOCALAPPDATA\CustomerSupportPlatform\ProductionDemo\prod-demo-YYYYMMDD-xxxxxxxx" --confirm-production-write
```

Replace the run-ID examples with the same newly generated value in both places. The tool re-verifies the pinned direct database target, requires an interactive terminal, and prompts the operator to type the exact project ref and run ID. The CLI flag is only an acknowledgement; it does not replace the human confirmation or the separate owner approval.

The command uses one serializable transaction. It checks run-owned identity collisions, creates the two organizations, eight users/memberships, four tickets, and four creation events, then commits. Passwords are generated with the application’s existing scrypt password hasher. The sanitized manifest records ownership IDs and labels; it does not contain passwords or password hashes. The one-time passwords are written only to the private credential JSON. The command prints sanitized counts and private file paths, never credential values.

Do not retry after an uncertain `COMMIT`, connection loss, or process interruption. Preserve both private files, stop, and have the named recovery owner reconcile the exact run. The tool does not rotate credentials or automatically clean these persistent accounts. Reusing a run ID is refused by the existing private path or database collision checks.

## Application validation and account lifecycle

After provisioning, validate only through the intended Production Web/API pair and only against the synthetic organizations. Confirm exact immutable deployment IDs/SHAs and database binding separately; provider deployment status or health readiness is not account-journey proof. Use separate sessions for admin, agent, and customer roles. Record sanitized outcomes and tenant-denial state comparisons without capturing secrets or unrelated customer data.

Deliver one-time credentials to the named owner using the approved private channel. The owner is responsible for access review, password rotation, and eventual retirement. There is no automatic expiry or cleanup in this persistent demo design. Do not add memberships across the two synthetic organizations or use these accounts for real support activity.

## Local validation evidence and limits

The provisioning core is tested only against a disposable loopback PostgreSQL database using synthetic data. That test covers the record shape, password hashing, private-file permissions, run collisions, pre-commit rollback, and lost-commit recovery retention. It does not prove that the Production target currently has the expected grants, that the Production Vercel app is bound to this database, or that hosted role journeys pass. Those are separate checks and require a reviewed PR plus exact-run approval.
