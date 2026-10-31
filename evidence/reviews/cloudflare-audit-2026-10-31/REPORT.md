# Security audit — incomplete source-only pass

Run run-2026-10-31-02; quick, scoped source review. Reviewed target ref 00731039fd1830c4acd7faa2132b3afe27062314; app source SHA 2bcf65fe0e7a388ff4d43695b5601ec6ce680e7a. Official skill source: official security-audit-skill checkout /skills/security-audit/SKILL.md.

Result: INCOMPLETE. No target-controlled code, tests, builds, browser, or live endpoints were executed. No confirmed vulnerability. One source-grounded throttle candidate was independently verified as needs_validation; no severity is assigned. This is not a clean bill of health.

## Blockers

The skill requires an OS-enforced sandbox with no external network, empty allowlisted environment, read-only target/toolchain, scratch-only writes, explicit resource bounds, and safe artifact promotion. This Windows host lacks WindowsSandbox.exe, but Docker VMM can enforce the required no-network/read-only/resource-limited container for trusted tools. The audit validators passed in that container. Target code/tests remain unrun because the available Linux app images do not include Vitest/Supertest and host node_modules are Windows-specific; the skill forbids dependency installation/network fetches. The skill also prohibits deployed endpoint and external-service probes, so no Preview or Production login-throttle request was made.

Prior run-1 was incomplete and had no structured coverage ledger or findings; no prior coverage is treated as validated. Source-only reconnaissance is summarized in architecture.md.

## Source review

Source shows DB-backed session verification, active membership-derived tenant/role context, customer ownership scope, staff-only management, strict request schemas, tenant-scoped ticket queries, composite tenant relations, and transactional ticket/activity writes. These observations do not prove runtime behavior or replace execution of DB/API/browser tests.

Login throttle source at api/src/modules/auth/routes.ts:19-53 uses a process-local Map, 15-minute window, default IP limit 20, account limit 5, and 4096-key ceiling. Vercel instance and proxy address topology remain unknown from source. This is an operational validation item, not a confirmed vulnerability; no severity assigned.

## Coverage critic result

The quick-profile final coverage critic accepted the throttle candidate as needs_validation and identified five additional coverage units. Per the skill, no second hunter wave was launched; the five units are recorded as deferred: session lifecycle/CSRF, admin membership mutation, child-resource and dashboard scope, Vercel web-to-API proxy, and CI/container supply chain. These are gaps, not findings or passes.

## Remaining validation

1. Provide a compatible preinstalled Linux test toolchain (or an equivalent already-available sandbox image) and run bounded dummy-data tests with the Docker sandbox; do not install or fetch dependencies.
2. Exercise cross-organization and same-organization other-customer denial, assignment rollback and verify rejected writes leave state unchanged using a disposable DB.
3. Validate throttle behavior only in the compliant isolated environment. Do not send audit probes to deployed services under this skill. Deployment facts must be owner-observed without audit traffic.
4. Keep Preview acceptance and release gates separate. Obtain focused independent review once missing evidence exists; maintain merge/submission hold.
