# Preview deployment recheck — 2026-10-30

## Candidate

- Branch: `codex/preview-mobile-roster-ux`
- Commit: `51a8d08fff1e86d5fe75d0392cd95f91904bca01` (`fix(web): make member roster responsive`)
- Web Preview: [deployment](https://customer-support-platfo-git-f28eab-arunkumars-projects-67bc2fdd.vercel.app/)
- API Preview: [deployment](https://customer-support-platfo-git-e22907-arunkumars-projects-67bc2fdd.vercel.app/)
- Web Vercel deployment ID: `7AMK1rBdkbPM2C9EbMccFMMiPKVm` — Ready, Preview, source SHA `51a8d08`.
- API Vercel deployment ID: `cr5Lm6d1KZS1CNa22KAvZKnNw6oU` — Ready, Preview, source SHA `51a8d08`.
- Scope: Preview only. No Production database or deployment was changed.

## Repeated verification

The local verification manifest `rounds.json` records three independent Playwright invocations, each with a fresh app server and browser suite: 23/23 tests passed in each round. The focused membership browser test passed 1/1 in every round. Responsive widths covered 320, 375, 768, 900, 901, 1024, and 1440 CSS px. Desktop and mobile membership screenshots are saved under `round-1`, `round-2`, and `round-3`.

Live Preview health was checked three times by navigating in a separate browser tab to the direct API and Web-proxy endpoints. All twelve observations returned the expected JSON:

| Round | Web proxy `/api/health` | Web proxy `/api/health/ready` | API `/api/health` | API `/api/health/ready` |
|---|---|---|---|---|
| 1 | `ok` | `ready` | `ok` | `ready` |
| 2 | `ok` | `ready` | `ok` | `ready` |
| 3 | `ok` | `ready` | `ok` | `ready` |

The clean Preview sign-in page rendered with labeled Email and Password controls and the ticket lifecycle introduction. One sign-in attempt using the pre-existing synthetic Preview administrator reproduced `Request origin or CSRF proof is invalid.` No further attempts were made. This is an authenticated flow failure; health/readiness alone does not clear it.

## Parent reviewer finding and disposition

The parent `100xdevs-assessment-reviewer` deployment review identifies exact `Origin === APP_ORIGIN` enforcement as the relevant security contract and recommends aligning API Preview `APP_ORIGIN` with the Web Preview origin, then redeploying API Preview. Keep the CSRF/origin guard enabled. In Vercel, API Environment Variables contains a branch-specific Preview `APP_ORIGIN` for the older `codex/vercel-api-route-preview` branch and a general Preview `APP_ORIGIN`; Production `APP_ORIGIN` is separate. Reveal is blocked by Vercel's authenticator-code challenge, so the effective value was not inspected or changed. The mismatch is the leading diagnosis, not confirmed configuration evidence.

### Remaining blockers

- **P1 Preview auth:** CSRF/origin mismatch still blocks login and live role/ticket flows. Correct API Preview `APP_ORIGIN` for the deployed Web origin and redeploy API Preview, then repeat sign-in and the synthetic ticket lifecycle.
- **Google Gemini CLI review:** not completed. CLI exited with missing authentication configuration (`GEMINI_API_KEY`, Vertex AI, or Google account auth). No Google-agent findings are claimed.
- **Release readiness:** still `NOT_READY` per the parent review until exact-candidate authenticated role/cross-tenant proof, compatible rollback, exact-SHA hosted CI/clean Compose replay, route-wide responsive/accessibility checks, and independent final review are complete. Docker Compose build remains blocked by container-to-npm-registry `ECONNRESET`; host registry access works.

## Existing screenshots

- `round-1/desktop-memberships.png`, `round-1/mobile-memberships.png`
- `round-2/desktop-memberships.png`, `round-2/mobile-memberships.png`
- `round-3/desktop-memberships.png`, `round-3/mobile-memberships.png`
- `../../checkpoints/screenshots/TK-29/11-memberships-desktop.png`
- `../../checkpoints/screenshots/TK-29/12-memberships-mobile.png`
