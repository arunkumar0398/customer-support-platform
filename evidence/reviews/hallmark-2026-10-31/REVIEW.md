# Hallmark findings follow-up

## Review mode and scope

- Mode: `checkpoint-review`, following the parent `100xdevs-assessment-reviewer` skill and its evidence-first playbook.
- Base candidate: `40bcce88e35df94893f8680c2fa9e10192ec4bd7` (`40bcce8`), branch `codex/preview-mobile-roster-ux`.
- Scope: membership roster typography and mobile density, keyboard focus visibility, and responsive behavior on the local disposable E2E fixture.
- This is a same-agent source and browser review, not an independent reviewer sign-off. No new Hallmark plugin or independent review service was available in this checkout.

## Findings reproduced

| Finding | Evidence before change | Result |
| --- | --- | --- |
| Mobile roster email text was too small | New Playwright assertion failed at 375 px: expected at least 13 px, computed 12 px. | Fixed; now 14 px. |
| Mobile role label was too small and cards felt dense | Source had 11 px role text, 11 px control labels, and 12 px account email. | Fixed with 12 px role/labels, 14 px account text, larger card padding, and 44 px role controls. |
| Focus-visible coverage omitted select/textarea and component rules removed the outline | Global selector covered button, link, input only; membership select `:focus` set `outline: none`. | Fixed with a shared 3 px focus ring for common controls and a local visible ring for the role selector. Keyboard navigation is asserted in the E2E test. |
| Repeated palette values were scattered through membership styles | Same label, control, error, and panel values appeared as literals in multiple selectors. | Replaced those repeated values with shared CSS custom properties. |
| Narrow viewport behavior needed fresh proof | Previous evidence was stale. | Combined browser test checks 320, 375, 768, 900, 901, 1024, and 1440 px; no document horizontal overflow at those widths. |

## Verification

- RED: `npm run test:e2e -- web/tests/e2e/memberships.spec.ts` failed on the 12 px email text assertion before styling changes.
- GREEN: the same focused test passed after the style changes and asserted the email/role text floors, semantic roster region/list/name, and keyboard-visible selector ring.
- Combined browser suite: `npm run test:e2e` — 24/24 passed (40.3 seconds).
- Full checks: `npm run check` — exit 0; 395 API tests, 12 Web tests, 24 browser tests discovered, lint, typecheck, and both builds passed.
- The safe local test runner restored all ten user-modified `evidence/checkpoints/screenshots/TK-29/*.png` files byte-for-byte after each browser run. They remain untouched by this review and must stay unstaged.

## Fresh visual evidence

The following screenshots were freshly captured from the local seeded membership route. They use synthetic `example.test` accounts from the disposable E2E database:

- [Desktop roster](memberships-desktop.png)
- [Mobile roster at 375 px](memberships-mobile.png)
- [Keyboard focus ring on the role selector](memberships-keyboard-focus.png)

The mobile view shows the complete account addresses wrapping within the member cards; the focus view shows a distinct purple 3 px ring around the keyboard-focused selector.

## Limitations and remaining work

- This proves one authenticated admin route on the local test fixture. It is not a route-wide WCAG audit, screen-reader test, color-contrast calculation, or deployed Preview observation.
- The new UI changes require a commit and a green exact-SHA GitHub Actions run before they can be counted as release evidence.
- A35 agent/customer Preview journeys and foreign-object denial remain blocked by missing known role credentials and a verified foreign tenant fixture. A36 migration rollback, exact-candidate Docker Compose, Cloudflare's isolated sandbox audit, and final independent review remain open.
- No Preview or Production deployment settings or hosted records were changed during this UI work.
