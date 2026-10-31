# Hallmark findings follow-up

## Review mode and scope

- Mode: `checkpoint-review`, following the parent `100xdevs-assessment-reviewer` skill and its evidence-first playbook.
- Base candidate: `40bcce88e35df94893f8680c2fa9e10192ec4bd7` (`40bcce8`), branch `codex/preview-mobile-roster-ux`.
- Scope: membership roster typography and mobile density, keyboard focus visibility, and responsive behavior on the local disposable E2E fixture.
- An independent read-only reviewer from the parent review workflow inspected commit `15a59b3` and returned `NOT_READY` with two P2s. This agent then reproduced and addressed both; the final reviewer must recheck the resulting commit.

## Findings reproduced

| Finding | Evidence before change | Result |
| --- | --- | --- |
| Mobile roster email text was too small | New Playwright assertion failed at 375 px: expected at least 13 px, computed 12 px. | Fixed; now 14 px. |
| Mobile role label was too small and cards felt dense | Source had 11 px role text, 11 px control labels, and 12 px account email. | Fixed with 12 px role/labels, 14 px account text, larger card padding, and 44 px role controls. |
| Focus-visible coverage omitted select/textarea and component rules removed the outline | Global selector covered button, link, input only; membership select `:focus` set `outline: none`. | Fixed with a shared 3 px focus ring for common controls and a local visible ring for the role selector. Keyboard navigation is asserted in the E2E test. |
| Repeated palette values were scattered through membership styles | Same label, control, error, and panel values appeared as literals in multiple selectors. | Replaced those repeated values with shared CSS custom properties. |
| Narrow viewport behavior needed fresh proof | Previous evidence was stale. | Combined browser test checks 320, 375, 768, 900, 901, 1024, and 1440 px; no document horizontal overflow at those widths. |

## Independent review follow-up

The parent-kit reviewer checked `15a59b36570bf5c2e6658d1a32acb06990e5c727` (`15a59b3`) and found:

1. **P2: Sign-in focus ring overridden.** `.auth-panel input:focus` removed the outline at higher specificity than the global focus-visible rule. Added an auth browser regression covering both Email and Password, confirmed it failed before the fix (`outlineStyle: none`), then removed the override and added a local focus-visible ring. The focused test now passes.
2. **P2: Test runs rewrote fixed screenshots.** New fixed-path review screenshot writes were removed. The shared checkpoint capture helper now does nothing unless `CHECKPOINT_SCREENSHOT_DIR` is explicitly set, and rejects a directory inside the protected TK-29 screenshot path. The three review screenshots above are fixed evidence from the first run and no longer get rewritten by Playwright.
3. **Evidence prose lagged the commit.** At review time, README, acceptance status, and handoff still described the follow-up as uncommitted. They have now been reconciled to committed candidate `7c2fdba6efb7c39dbf723f100644a5c53928fd84`; exact-SHA GitHub Actions [run #25](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41177630515) passed. The candidate has not yet received final independent review.

The reviewer's `NOT_READY` was issued because the follow-up evidence text had not been reconciled; it was not a source-code objection to `7c2fdba`. After this update, request a read-only follow-up review for the evidence and exact candidate.

## Verification

- RED: `npm run test:e2e -- web/tests/e2e/memberships.spec.ts` failed on the 12 px email text assertion before styling changes.
- GREEN: the same focused test passed after the style changes and asserted the email/role text floors, semantic roster region/list/name, and keyboard-visible selector ring.
- Combined browser suite: `npm run test:e2e` — 24/24 passed (40.3 seconds).
- Full checks: `npm run check` — exit 0; 395 API tests, 12 Web tests, 24 browser tests discovered, lint, typecheck, and both builds passed.
- Before the screenshot-safety fix, the safe local runner restored all ten user-modified `evidence/checkpoints/screenshots/TK-29/*.png` files byte-for-byte after the browser suite. With the fix, routine Playwright runs leave them alone and produce no new fixed-path screenshot files.
- Follow-up RED: `npm run test:e2e -- web/tests/e2e/auth.spec.ts -g "visible focus indicator"` failed because sign-in input `outlineStyle` was `none`; after the correction the same focused test passed for Email and Password.
- Follow-up combined browser suite: 25/25 passed in 37.9 seconds. `npm run check` exited 0 with 395 API tests, 12 Web tests, 25 browser tests discovered, lint, typecheck, and both builds. The runner reported `screenshotChangedAndRestored: []` and `screenshotHashesPreserved: true`.

## Fresh visual evidence

The following screenshots were freshly captured from the local seeded membership route. They use synthetic `example.test` accounts from the disposable E2E database:

- [Desktop roster](memberships-desktop.png)
- [Mobile roster at 375 px](memberships-mobile.png)
- [Keyboard focus ring on the role selector](memberships-keyboard-focus.png)

The mobile view shows the complete account addresses wrapping within the member cards; the focus view shows a distinct purple 3 px ring around the keyboard-focused selector.

## Limitations and remaining work

- This proves one authenticated admin route on the local test fixture. It is not a route-wide WCAG audit, screen-reader test, color-contrast calculation, or deployed Preview observation.
- GitHub Actions [run #25](https://github.com/arunkumar0398/customer-support-platform/actions/runs/41177630515) passed on exact SHA `7c2fdba6efb7c39dbf723f100644a5c53928fd84`. The parent-kit reviewer confirmed the sign-in focus and screenshot-safety fixes in source. A fresh final independent review is still pending.
- A35 agent/customer Preview journeys and foreign-object denial remain blocked by missing known role credentials and a verified foreign tenant fixture. A36 migration rollback, exact-candidate Docker Compose, Cloudflare's isolated sandbox audit, and final independent review remain open.
- No Preview or Production deployment settings or hosted records were changed during this UI work.
