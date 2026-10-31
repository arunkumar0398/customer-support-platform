# Cloudflare security audit artifacts — provenance and limits

These files publish the output of official skill run `run-2026-10-31-02`, a quick, scoped, source-only audit of application source `2bcf65fe0e7a388ff4d43695b5601ec6ce680e7a` (audited checkout HEAD `00731039fd1830c4acd7faa2132b3afe27062314`). The package is incomplete and is not a clean bill of health.

The four generated artifacts were checked for connection-string credentials, bearer tokens, JWTs, private-key blocks, AWS access keys, and email addresses; no matches were found. The host-specific absolute path to the skill checkout was replaced in the report with a generic label. The structured finding and coverage ledger otherwise retain their run output.

## What was run

The official findings and coverage validators passed in the preinstalled `node:24-alpine` Docker image using no network, read-only root and mounts, 256 MiB memory, 0.5 CPU, and 32 processes. The validator result is included here.

A later inventory of the preinstalled Linux API images found Node, Prisma, and PostgreSQL client dependencies, but no Vitest or Supertest in any of the checked API images. Per the skill, no dependencies were installed or fetched. No target-controlled test, build, browser, Preview/Production probe, or deployed login-throttle probe was run. Target execution and throttle reproduction remain **NOT_RUN**.

## Coverage and finding status

The audit has one login-throttle candidate with verdict `needs_validation` and no severity. Five coverage units remain `deferred` under the quick profile. Their source review is not a test or an audit pass. Preview agent/customer journeys and verified foreign-ticket denial are separate acceptance work and remain blocked pending safe credentials and a verified second-tenant fixture.

Keep merge and submission blocked until the missing permitted audit execution, Preview acceptance, and focused independent G7 review are complete.
