# Preview A35 execution package — prepared, not approved

> **Superseded for current execution:** use [the refreshed 2026-11-02 package](PREVIEW-EXECUTION-APPROVAL-2026-11-02.md). This file records the earlier target snapshot and is retained for history; its deployment IDs and run plan are not current approval values.

**State:** PREPARED / NOT APPROVED FOR HOSTED WRITES  
**Prepared:** 2026-11-01  
**Local fixture package:** provisioner reviewed in the separate local fixture evidence; this record does not authorize its hosted mode.

## Intended target (owner must confirm the mapping before approval)

| Required field | Recorded value | Evidence / remaining condition |
|---|---|---|
| Neon project | customer-support-platform-preview | Name in the prior read-only readiness record. |
| Neon project ID | sweet-sea-96169409 | Last observed in the owner’s Neon console URL. Reconfirm it is the Preview project. |
| Neon branch | production | Prior owner-session read-only record; the compute was reported ACTIVE. |
| Neon branch ID | br-spring-mode-b30iyj2z | Last observed in the owner’s Neon console URL. Reconfirm that this ID names the production branch above. |
| Direct endpoint ID | ep-shy-surf-b36pzssx | Prior read-only readiness record. Endpoint-to-project/branch mapping has not been independently confirmed. |
| Database | neondb | Prior read-only readiness and fixture-discovery record. |
| Database role | **MISSING — owner must provide the exact expected login role name** | A username is not a credential. It must match the provisioner target guard and intended direct Preview connection. |
| Endpoint/branch mapping | **UNVERIFIED — owner confirmation required** | Do not infer from SQL current_database/current_user. The project/branch IDs above and endpoint ID must be shown together in Neon’s authorized read-only console/API source. |
| API deployment | ID AEp2x3kR68FCA6rsdchApNx8WG8U; recorded Preview source 24f51c05328fc764bf7089fce8f398adad475648 | Historical Vercel deployment record, Ready at the recorded observation. Reconfirm exact deployment and source before A35. |
| Web deployment | ID GZwzX4yme3DraJgf32HNFNtWYHyA; recorded Preview source 24f51c05328fc764bf7089fce8f398adad475648 | Historical Vercel deployment record, Ready at the recorded observation. Reconfirm exact deployment and source before A35. |
| Current audit candidate | c1e73a31fea0bebda73c063f6e2816c6c1a88e0a (local, unpushed audit descendant of Run-7 C79; application source baseline 5671f14b106ba8898b45e7e36ee4c7670d406bda) | Local audit candidate, not a hosted deployment. Do not claim it is the app SHA under test. |
| Unique fixture run ID | pv-a35-20261101-c79-8ed277ab25 | Generated for this package; use once only after target mapping and owner approval. |
| Credential directory | C:\Users\sivaa\AppData\Local\CustomerSupportPlatform\PreviewCredentials\pv-a35-20261101-c79-8ed277ab25 | Created empty. ACL verified: only current Windows user ARUN\sivaa has inherited entries removed and explicit full control. No credential was created or stored. |
| Operator / cleanup owner | ARUN\sivaa (current Windows account) | Runs provisioner, acceptance, reconciliation, cleanup, and verifies zero run-owned records. Neon/Vercel owner must approve the target and handle an uncertain database commit outcome. |

## Permitted test mutations

After written approval naming this exact run and confirmed target only:

1. Provision the supported run-scoped synthetic graph: two organizations, eight synthetic users/memberships, and four tickets, using the package’s existing transaction and target-identity guard.
2. As those synthetic principals, create a ticket and comment as a customer; update a fixture-owned ticket and add a comment as an agent; perform one permitted fixture-agent membership role change as the fixture admin and restore the original role immediately.
3. Attempt only the planned denied reads/writes against the fixture’s same-organization other-customer ticket and second-organization ticket: detail, update, assignment, comment, and non-admin membership operations.
4. Reconcile the explicitly created ticket/comment/activity and restored membership state, run the exact-manifest cleanup, and verify no run-owned fixture records remain. Revoke/rotate temporary credentials through the approved process and remove the private files only after confirmed cleanup.

No existing customer/production record is a test target. No migration, seed command, Production request, deployment configuration change, or unrelated mutation is permitted by this package.

## Approval required

The project owner must approve the exact project ID, branch ID, endpoint ID, database, database role, Web/API deployment IDs and SHAs, run ID, mutation list, and cleanup owner above. Approval is **not present**. The CLI acknowledgement flag is not approval. Resolve the two MISSING/UNVERIFIED rows first. No hosted write or authenticated Preview request has been made for this package.

## Execution sequence after approval

1. Read-only owner confirmation of endpoint-to-branch mapping; run the existing target verifier once with the owner-approved identities.
2. Provision once with this run ID into the private directory. If commit outcome is uncertain, preserve private recovery files and reconcile; never retry blindly.
3. Verify every synthetic role through the exact intended Preview Web/API deployments and retrieve the unique fixture ticket to establish runtime DB binding.
4. Run A35 with separate role sessions and sanitized request/response evidence; snapshot ticket fields/version, comments, and activity before/after denied writes.
5. Reconcile and clean up immediately, verify zero residual run-owned records, revoke/rotate credentials, then remove private credential files.
