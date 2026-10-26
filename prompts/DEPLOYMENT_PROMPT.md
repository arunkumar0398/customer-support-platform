# Deployment Task Prompt — ONLY AFTER HUMAN APPROVAL

Do not paste this before G0–G5 are real PASS. For production, request a **separate explicit approval** after preview passes.

--- BEGIN ---
The secure local MVP is implemented and verified, and I am requesting a **deployment preparation and preview plan** for Vercel + Neon. Follow root `AGENTS.md`, `harness/VERCEL_NEON_DEPLOYMENT.md`, accepted specs, exact `evidence/` gate results and official Vercel/Neon docs. Verify the current SHA and rerun G0–G5 first. If any gate isn't PASS or working tree differs unexpectedly, stop.

Perform only explicitly authorized remote actions. First inspect existing Vercel teams/projects and Neon project/branch availability. Show targets, expected cost/billing implications, secrets/config names (never values), data isolation, exact migration target, and rollback plan. DO NOT provision cost-bearing services, paste secrets, run migrations against production, push, merge, publish production or turn on auto-deploy without explicit human approval.

Prepare verified Vercel `web/` (Vite) and `api/` (Express Node Function) project builds from the monorepo. Validate `api/index.ts` default export, absence of persistent listener, correct generated Prisma Client, pooled Neon runtime URL and direct URL for controlled migrations, secure cookie and same-origin frontend `/api` rewrite, static SPA refresh, correct function region.

Once I explicitly approve PREVIEW provisioning/deployment, use a disposable **nonproduction Neon branch** and synthetic seeds. Run preview migration once through reviewed direct connection and run HTTPS API/browser/tenant/CSRF/concurrency smoke tests against deployed SHA; save sanitized `evidence/releases/preview.md`.

Report preview evidence and request a second authorization before any PROD secrets, migration, promotion or domain assignment. For a production-approved task, stage tested code, run safe checks, apply reviewed compatible migrations once, verify and publish exact build; document code rollback separately from schema rollback. Never claim deployed without verifying live URL and SHA.
--- END ---
