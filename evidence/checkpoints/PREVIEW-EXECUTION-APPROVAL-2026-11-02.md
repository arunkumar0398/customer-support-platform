# Preview A35 execution package — refreshed 2026-11-02

**State: NOT APPROVED — no hosted writes, authenticated role requests, or deployments are authorized by this record.** This is the current execution package; the 2026-11-01 package is historical.

## Verified target and deployment facts

| Item | Observed value | Evidence and limit |
|---|---|---|
| Neon project | `customer-support-platform-preview` / `sweet-sea-96169409` | Current Neon Console project context. This is the Preview project. |
| Neon branch | `production` / `br-spring-mode-b30iyj2z` | Current Neon Console branch context. “production” is a branch label inside the Preview project, not the Production Neon project. |
| Neon compute endpoint | `ep-shy-surf-b36pzssx`, **ACTIVE** | Current Computes view displays this endpoint under the specified Preview project/branch. A prior read-only `SELECT 1` succeeded; it is not repeated here. |
| Database | `neondb` | Previously recorded during Preview readiness. No SQL write, migration, seed, or new fixture discovery was performed in this refresh. |
| Expected database role | `neondb_owner` | Carried from the previously reported target identity. The API runtime’s configured role is not independently verified. |
| Current Ready API deployment | ID `DB8kjRru6d6EzY9tqV12kvrxRqiK`; branch `codex/preview-provisioner-f55decb`; source `a6922fca49d05abe774c26fdf5774db750fd094c`; deployment domain `customer-support-platfo-git-c3f219-arunkumars-projects-67bc2fdd.vercel.app` | Read-only Vercel deployment detail page; status Ready / Preview. The local audit candidate `080d883…` is not this deployment. |
| Current Ready Web deployment | ID `HCkQZraegPxMo1NPuNi3WbotiM2L`; branch `codex/preview-provisioner-f55decb`; source `ddf3d69b32db494e04ae36256633633bf9132583`; deployment domain `customer-support-platfo-git-dcd60f-arunkumars-projects-67bc2fdd.vercel.app` | Read-only Vercel deployment detail page; status Ready / Preview. The Web change after `a6922fca` is in `web/tests/e2e/memberships.spec.ts`; this does not by itself prove the built deployment’s API destination. |
| Web Preview `API_ORIGIN` project setting | `https://customer-support-platfo-git-e22907-arunkumars-projects-67bc2fdd.vercel.app` | Current Preview Config value shown in Vercel. It does **not** match the selected API deployment domain above. The current setting alone does not prove what value an already-created deployment captured. |
| API-to-Neon runtime binding | **UNVERIFIED** | The API `DATABASE_URL` is secret. No secret value was revealed or copied. An owner must privately verify that its endpoint maps to the Preview project/branch above and that its login role is the expected role. Health/readiness is not binding proof. |
| Preview access policy | Prior observation: API Require Log In and Web trusted as a Preview source; Web protection enabled | Historical console observation from 2026-11-01, not reverified for these exact deployment IDs. Reconfirm before execution. |

## Chosen configuration path

The present Web/API pair is **not cleared for A35**. Use one coordinated Preview-only correction:

1. Owner sets Web Preview `API_ORIGIN` to the exact API deployment domain above (`DB8…`), not to an older branch alias, then redeploys the Web from source `ddf3d69…` so the deployment captures the corrected value.
2. Owner privately verifies API Preview `DATABASE_URL` endpoint and role against the Neon project/branch above. Keep the URL and credential private; report only match/mismatch and role name.
3. Re-read the deployment identities, destination setting, and protection/trusted-source state after the redeploy. Confirm Web `/api/health/ready` is forwarded through that exact Web→API pair. This proves proxy routing/health only; the provisioned unique ticket lookup is still required to prove DB binding.

These are owner-controlled hosted configuration/deployment actions and are **not performed** by this local package. If the owner instead selects another deployment pair, replace the IDs, SHAs, domains, and destination in this record and approve that exact pair before testing.

## Run-scoped fixture and credential custody

| Field | Prepared value | Verification |
|---|---|---|
| Fixture run ID | `pv-a35-20261101-c79-8ed277ab25` | Original run was never executed; it remains unused in the record. Use once only after approval. |
| Credential directory | `C:\Users\sivaa\AppData\Local\CustomerSupportPlatform\PreviewCredentials\pv-a35-20261101-c79-8ed277ab25` | Rechecked empty. `icacls` shows only `ARUN\sivaa` with `(OI)(CI)(F)`; no credentials were created. |
| Operator / reconciliation owner | `ARUN\sivaa` | Current `whoami` result. The Neon/Vercel owner remains responsible for target confirmation and any uncertain hosted commit outcome. |
| Synthetic credentials | Provisioner-generated, short-lived, written only to the private directory | No safe hosted role credentials currently exist. Never use the local shared seed password. |

## Mutations allowed only after the approval below

Use only the provisioner’s guarded run graph: two synthetic organizations, an admin, agent and two customers per organization, plus the provisioner’s designated synthetic tickets. Then allow only:

- Customer creates, lists, opens, and comments on the customer’s own run-owned ticket.
- Agent performs one permitted update and comment on a run-owned ticket.
- Fixture admin performs one permitted fixture-agent membership change and immediately restores the original role.
- Denial attempts against the designated same-organization other-customer and second-organization tickets: detail/read, update, assignment, comment, and non-admin membership operations.
- Reconcile permitted changes, exact-manifest cleanup, credential revocation/removal after confirmed cleanup, and a read-only check proving zero residual run-owned rows.

No migration, seed, existing-user mutation, Production request, unrelated object, or deployment/secret change is included in fixture-run approval. The separate configuration correction above requires its own owner approval or explicit inclusion in the signed approval below.

## Approval record — still missing

Before execution, the owner must approve **this exact** scope in writing and confirm:

- Project `sweet-sea-96169409`, branch `br-spring-mode-b30iyj2z`, endpoint `ep-shy-surf-b36pzssx`, database `neondb`, expected role `neondb_owner`.
- API deployment `DB8kjRru6d6EzY9tqV12kvrxRqiK` / source `a6922fca…` and Web deployment `HCkQZraegPxMo1NPuNi3WbotiM2L` / source `ddf3d69…`, plus approval for the Preview-only `API_ORIGIN` correction and Web redeploy described above.
- The one-time run ID, private credential directory/operator, exact permitted mutations, reconciliation owner, and cleanup plan above.
- Private API database endpoint/role match and refreshed Preview protection/trusted-source status.

**Approval has not been received.** The CLI confirmation flag is not approval. Do not provision, authenticate, mutate, deploy, or reveal secrets until this approval is recorded. After approval: verify target once → provision once → verify unique fixture through the approved pair → run A35 role/denial matrix with before/after state → reconcile → cleanup → confirm zero residual rows and remove private files.
