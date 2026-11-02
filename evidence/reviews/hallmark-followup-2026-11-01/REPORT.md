# Hallmark rendered follow-up — 2026-11-01

## Scope and provenance

This focused review addresses the measured sign-in focus-ring defect and three text-contrast failures recorded in the prior Hallmark report. Work ran in the isolated worktree `D:/__superset/cactro-tests/_react-node-apps/customer-support-platform-ui-2dee30d`, based on `a0d71d1b4ab6440e1b7108db590a5583854391eb`. The changes and results in this report are local working-tree evidence; they have no commit SHA or exact-SHA Actions result yet. The original dirty worktree and its screenshot edits were not used.

## Changes reviewed

- Added a consistent 3px `:focus-visible` outline for keyboard-operated links, buttons, inputs, selects, textareas, and tabindex controls. Removed local `outline: none` suppression from the sign-in, ticket create/detail/list, and membership form styles.
- Raised the sign-in story footer, panel eyebrow, and privacy-note text colors to accessible values.
- Changed dashboard bar animation from `width` changes to `transform: scaleX(...)`; verified the reduced-motion rule separately.

## Rendered contrast and layout measurements

Actual computed styles were sampled in Chromium at 320, 375, 1280, 1440, and 1920 CSS px. All contrast values exceed WCAG AA's 4.5:1 normal-text threshold.

| Element | Foreground | Background | Ratio | Result |
|---|---|---|---:|---|
| Sign-in story footer | `rgb(156, 175, 170)` | `rgb(21, 56, 59)` | 5.50:1 | Pass |
| Sign-in panel eyebrow | `rgb(82, 100, 91)` | `rgb(241, 244, 239)` | 5.68:1 | Pass |
| Sign-in privacy note | `rgb(82, 100, 91)` | `rgb(241, 244, 239)` | 5.68:1 | Pass |

The rendered focus ring is `3px solid rgb(40, 89, 63)` on `rgb(241, 244, 239)`, a measured 7.30:1. At each of the five widths, the document and body widths equaled the viewport (no horizontal page overflow). Evidence screenshots are `sign-in-320.png`, `sign-in-375.png`, `sign-in-1280.png`, `sign-in-1440.png`, `sign-in-1440-full.png`, and `sign-in-1920.png`; raw computed measurements are in `computed-measurements.json`.

## Keyboard checks

Browser tests asserted a visible computed 3px focus outline while keyboard-tabbing through:

- Sign-in Email, Password, and submit controls at all five widths.
- Queue search and applicable customer/assignee/status controls for admin, agent, and customer at 375px and 1280px.
- Ticket creation requester and title inputs, description textarea, and priority select.
- Ticket detail subject and description fields, status and priority selects, and Save.
- Membership role select at narrow width.

Source inspection found no remaining `outline: none` rule in the checked application styles. The shared focus rule covers common native interactive elements and tabindex controls. This is not a manual keyboard audit of every route/state or a screen-reader test.

## Dashboard motion check

The dashboard bar retains its full track layout width and animates using `transform: scaleX`. A rendered assertion observed the transform transition, an expected scale of `0.67` for a two-thirds sample, and matching bar/track layout widths (614px). With reduced motion enabled, the transition duration computed to `0.01ms`. This addresses the specific relayout concern; it is not a complete motion or assistive-technology review.

## Commands and outcomes

- `npm run check` — exit 0. Lint, TypeScript checks, API tests **392/392**, Web tests **12/12**, 45 E2E tests discovered, and API/Web production builds passed. Vite emitted its existing large-chunk advisory.
- `npm run test:e2e` — exit 0, **45/45 passed** in 54.0 seconds, using the local disposable test setup.
- All 12 tracked `evidence/checkpoints/screenshots/TK-29/` PNGs were restored from the byte-preserved pre-run backup after Playwright rewrote them. The final git diff should contain none of those screenshot paths.

## Remaining limitations

- A22/A23/A37 remain **PARTIAL**. The complete route × role × desktop/mobile × success/loading/empty/validation/forbidden/failure/retry matrix has not been executed. The exact remaining cells are listed in `evidence/checkpoints/UI_A22_A23_MATRIX_2026-11-01.md` under this follow-up.
- Manual screen-reader review was **NOT_RUN**. No axe scan or broader assistive-technology pass is claimed.
- Preview role/tenant acceptance A35 remains blocked pending verified API-to-Neon Preview binding and safe synthetic credentials/fixtures.
- The bounded Cloudflare audit remains blocked because the compliant no-network image contains no compatible preinstalled test runner. No packages were installed/fetched and no deployed endpoint was probed.
- This report is not an independent Hallmark sign-off, exact-SHA CI result, Preview test, or G7 release review.
