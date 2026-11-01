## Preview readiness observation — 2026-11-01

**Scope/status:** Neon Preview compute recovery and synthetic-fixture discovery are **reported PASS** from the authorized owner browser session. This is readiness evidence only; it does not pass authenticated role or authorization acceptance.

- Neon project: customer-support-platform-preview; branch: production; database: neondb; compute endpoint: ep-shy-surf-b36pzssx.
- Observation: 2026-11-01 09:11 Asia/Calcutta (03:41 UTC). A read-only SELECT 1 returned 1 after compute became active.
- One read-only fixture-discovery query returned 15 active synthetic memberships and 15 synthetic tickets across two organizations. No password/hash columns were selected; no credentials or unnecessary account/ticket identifiers are published here.
- Preview deployment health was checked against Web alias customer-support-platfo-git-f28eab-arunkumars-projects-67bc2fdd.vercel.app and API alias customer-support-platfo-git-e22907-arunkumars-projects-67bc2fdd.vercel.app. Both Vercel deployments were Ready, Preview, branch codex/preview-mobile-roster-ux, source a5673cbcee3c6b30178404c80c1eb1bf56f963a4. API /api/health and /api/health/ready, and Web proxy /api/health, returned healthy JSON.
- Exact Neon branch alignment for the running API remains **UNVERIFIED** because the masked runtime database value was not read. No migration, seed, or Production check was performed.
- A35 preconditions are **READY** (compute and fixtures discovered; Preview app health observed), but A35 remains **BLOCKED / NOT_RUN**: safe short-lived Preview passwords for synthetic admin, agent, and customer sessions are not available. The local shared seed password was not tried.

## Follow-up readiness check — 2026-11-01 09:52 IST / 04:22 UTC

- Neon Console still showed the Preview project's `production` branch compute as **ACTIVE** at endpoint `ep-shy-surf-b36pzssx`. No second fixture query was run.
- The Web and API Vercel deployment records both showed **Ready**, Preview environment, branch `codex/clean-candidate-b2fd369`, exact application commit `24f51c05328fc764bf7089fce8f398adad475648`. Deployment records: [Web](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-web/GZwzX4yme3DraJgf32HNFNtWYHyA) and [API](https://vercel.com/arunkumars-projects-67bc2fdd/customer-support-platform-api/AEp2x3kR68FCA6rsdchApNx8WG8U). Current Preview deployment aliases were `customer-support-platfo-git-2c9bab-arunkumars-projects-67bc2fdd.vercel.app` (Web) and `customer-support-platfo-git-973332-arunkumars-projects-67bc2fdd.vercel.app` (API).
- Read-only GET `/api/health/ready` on each alias returned `{"status":"ready"}`. The API readiness route proves its configured database connection can answer the readiness query; it does not disclose or prove that the runtime uses this specific Neon project/branch. Runtime DB branch alignment remains **UNVERIFIED**.
- The readiness URLs were accessible without a Vercel login in this browser session. This only records access to health routes; it does not establish authenticated Preview protection access for role journeys.
- The owner-approved one-time read-only fixture discovery remains the 09:11 IST observation above: 15 active synthetic memberships and 15 synthetic tickets across two organizations. A35 preconditions remain **READY**. A35 remains **BLOCKED / NOT_RUN** because safe short-lived credentials are unavailable and the application has no signup, password-reset, global-user-provisioning, or credential-change endpoint. Its admin membership endpoint adds only an already-existing user. Do not use the local shared seed password in Preview.

No migration, seeding, authenticated request, or hosted data mutation was performed. Do not publish passwords, hashes, full account identifiers, or fixture IDs in evidence.

No credentials, password hashes, or personal credentials were accessed or recorded.
