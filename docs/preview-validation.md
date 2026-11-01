# Preview fixture provisioning and validation

This tool creates disposable synthetic records for A35 authorization and workflow checks. It is separate from `api/prisma/seed.ts`; the local demo seed guard remains unchanged. The provisioner never loads `.env`, never accepts a connection URL as a command-line argument, and never prints credentials or hashes.

## Fixture set

Each unique run creates two organizations (Alpha and Beta), each with an admin, agent, and two customers, plus one customer-owned ticket per customer. Each ticket starts assigned to that organization's agent and has one `TICKET_CREATED` activity event. Emails, slugs, descriptions, and ticket titles include the unique run ID. IDs, ticket numbers, and passwords are newly generated. Passwords use the same scrypt format and parameters as application login.

The private credentials JSON contains all eight synthetic login emails and one-time passwords. The sanitized manifest contains the run ID, verified endpoint/database identity, role and organization identifiers, ticket identifiers, and creation time. It contains no password, password hash, or database URL. Both files are created exclusively, outside the repository, and are removed by successful cleanup. On Windows, use a directory whose ACL grants access only to the operator; Node's POSIX `0600` mode is not a substitute for a restrictive Windows ACL.

If provisioning reports an error after it starts `COMMIT`, keep both private files and do not retry with the same run ID. The server may have committed even if the client did not receive the confirmation. Reconcile the run ID against the verified database, then use the matching manifest to clean up or retain the fixtures safely. The provisioner deliberately preserves recovery files whenever commit outcome is uncertain.

## Local disposable database verification

Use only a disposable local PostgreSQL database migrated with the checked-in migrations. `TEST_DATABASE_URL` must identify a loopback `support_test` database/user. Never point this mode at `support_dev`, Preview, or Production.

PowerShell example (the connection string is read without echo and stays in this shell process):

```powershell
$secret = Read-Host 'Disposable local TEST_DATABASE_URL' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $env:TEST_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); Remove-Variable secret,ptr }
npm run db:migrate:test
npm run test:api -- tests/preview/provisioning.test.ts tests/auth/password.test.ts
```

The integration test verifies the actual database/user before writing. It exercises endpoint/database mismatch refusal, transaction rollback after a forced pre-commit failure, collision refusal without changing the colliding row, and run-scoped cleanup while another run remains. Use the suite's own temporary output directory; it removes only the temporary test data it created.

## Read-only Preview target check

Preview must use a **direct** Neon connection URL, not a pooled URL. Set `PREVIEW_DIRECT_DATABASE_URL` in the operator's private shell environment. The URL is checked against the exact expected direct endpoint ID, branch ID, database name, and username before connecting; the server's `current_database()` and `current_user` are then checked independently. The owner must verify the Neon console's endpoint-to-branch mapping before supplying the expected IDs; SQL identity alone cannot prove a Neon branch name. The URL's endpoint host, username, database, and allowed TLS parameters are never printed.

```powershell
npm run preview:verify-target -- --mode preview `
  --expected-endpoint-id ep-expected-id `
  --expected-branch-id br-expected-id `
  --expected-database neondb `
  --expected-user expected_role
```

This command is read-only. It does not prove which URL Vercel has configured for the API runtime; A35 requires a separate runtime-binding proof through a unique synthetic fixture observed through the intended Preview app.

## Provision and cleanup commands

Provisioning and cleanup write to the specified database. They require the correct mode, exact endpoint/database/role identity, a unique run ID, and an absolute private output directory outside the repository. Preview mode additionally requires the operator to pass `--confirm-preview-write`; this flag is an acknowledgement, not a substitute for project-owner approval. Do not execute Preview writes until the owner has explicitly approved the endpoint and run.

Create the output directory in advance and restrict its Windows ACL to the operator account. For example, replace the path and account with the local private destination and account you intend to use:

```powershell
New-Item -ItemType Directory -Path C:\Users\operator\AppData\Local\SupportPreviewPrivate
$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls C:\Users\operator\AppData\Local\SupportPreviewPrivate /inheritance:r
icacls C:\Users\operator\AppData\Local\SupportPreviewPrivate /grant:r "${account}:(OI)(CI)F"
```

```powershell
npm run preview:provision-fixtures -- --mode preview `
  --expected-endpoint-id ep-expected-id `
  --expected-branch-id br-expected-id `
  --expected-database neondb `
  --expected-user expected_role `
  --run-id pv-20261101-run-unique `
  --output-dir C:\Users\operator\AppData\Local\SupportPreviewPrivate `
  --confirm-preview-write
```

Store the printed credentials file in the private directory and use separate browser contexts for each account. Do not put credentials in Git, chat, shell history, screenshots, test reports, CI output, or Vercel logs. Use the sanitized manifest to record object IDs and target identity; share only sanitized evidence.

After acceptance, revoke or rotate temporary credentials through the approved account process, then remove the run's database objects using the same verified target and manifest:

```powershell
npm run preview:cleanup-fixtures -- --mode preview `
  --expected-endpoint-id ep-expected-id `
  --expected-branch-id br-expected-id `
  --expected-database neondb `
  --expected-user expected_role `
  --run-id pv-20261101-run-unique `
  --manifest C:\Users\operator\AppData\Local\SupportPreviewPrivate\preview-fixtures-pv-20261101-run-unique.json `
  --confirm-cleanup --confirm-preview-write
```

Cleanup locks and validates the manifest's full shape, uniqueness, role assignments, organization membership, and ticket requesters, then validates every run-owned organization, user, membership, ticket, comment, and activity actor before deleting anything. It stops without mutation if it finds a missing/changed fixture identity, a membership outside the run, or a child-record actor outside the fixture users. If an acceptance action created extra records or memberships, explicitly inspect and dispose of those synthetic records under the approved owner process before retrying cleanup. Cleanup deletes only the exact manifest IDs after those checks; it does not bulk-delete by run prefix.

## A35 execution record

The intended matrix is: customer create/list/detail/comment on own ticket; agent permitted update with activity history; admin permitted membership action; same-organization other-customer denial; cross-organization ticket read and write denials; and non-admin membership denials. For each denied write, capture sanitized request/response status and compare ticket fields/version, comments, and activity counts before and after. A denied response alone is not proof that no mutation occurred.

No Preview fixture provisioning or A35 request was performed while preparing this package. Hosted writes remain subject to explicit owner approval.
