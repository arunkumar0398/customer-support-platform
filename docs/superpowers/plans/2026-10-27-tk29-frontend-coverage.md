# TK-29 Frontend Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Verify the assessment's narrow and desktop frontend usability plus keyboard and state feedback, and fix only defects demonstrated by browser regressions.

**Architecture:** Extend the existing database-backed Playwright scenarios in place so TK-29 adds no authentication requests or new fixture domains. Use browser geometry, accessible-role/label assertions, keyboard interaction, and screenshots on the current local app.

**Tech Stack:** React, TypeScript, Playwright, PostgreSQL disposable `support_test` fixture.

**Spec:** `reference/assessment.pdf` pages 1 and 3; `harness/ACCEPTANCE_MATRIX.md` A22, A23, A37; `harness/IMPLEMENTATION_TASKS.md` TK-29.

## Global Constraints

- Use only the guarded disposable database `support_test`; run `node scripts/verify-test-database.mjs` before Playwright tests that write fixtures.
- Preserve production code and all existing work; no reset, cleanup, deployment, push, merge, or provisioning.
- Do not add extra sign-in attempts; extend existing journeys to avoid the local login limiter.
- Keep A22/A23/A37 and G4 at NOT_RUN until their complete criteria have exact-SHA evidence.
- Use TDD for any production CSS or behavior change; test-only evidence may establish that existing behavior already meets a requirement.

## Review Focus

- At 375px, the document must not overflow horizontally; intentional roster/table overflow must remain inside its named scroller.
- The sign-in, create, detail, dashboard, and membership screens must remain usable at a narrow viewport and the existing desktop viewport.
- Keyboard navigation must reach labeled form controls in a predictable order and focused controls must have a visible focus treatment.
- Loading, empty, validation, permission-denied, stale-conflict, and service-failure feedback must remain visible and usable after viewport changes.
- Synthetic long account names and ticket content must wrap or scroll within their own component without widening the page.

---

### Task 1: Mobile viewport coverage across existing product journeys

**Files:**
- Modify `web/tests/e2e/auth.spec.ts`
- Modify `web/tests/e2e/ticket-list.spec.ts`
- Modify `web/tests/e2e/ticket-create.spec.ts`
- Modify `web/tests/e2e/ticket-detail.spec.ts`
- Modify `web/tests/e2e/dashboard.spec.ts`
- Modify `web/tests/e2e/memberships.spec.ts`

**Interfaces:**
- Reuse each spec's existing fixture and `signIn` helper; do not add tests that perform additional sign-ins.
- Desktop baseline is Playwright's configured default viewport; narrow viewport is 375×812.

- [x] Add narrow-viewport assertions to the existing sign-in, create, detail, dashboard, and membership journeys; queue was already covered at 375×812.
- [x] Run the touched browser specs with the disposable DB guard. Document width stayed within the viewport; membership/workload table overflow remains in table wrappers.
- [x] A new visible-label assertion first failed because member action buttons exposed full emails. After abbreviating their visible labels, the mobile width assertion reproduced 583px document overflow from the off-screen clipped roster label. Anchoring the clipped label at the viewport origin fixed the overflow; the guarded membership test passed afterward.
- [x] Captured and visually inspected narrow-viewport screenshots in `evidence/checkpoints/screenshots/TK-29/`.

### Task 2: Keyboard focus and visible feedback

**Files:**
- Modify `web/tests/e2e/ticket-create.spec.ts`
- Modify owning CSS only if a regression exposes missing focus visibility.

**Interfaces:**
- Use existing `Subject` and `Description` accessible labels and existing native form controls.
- Focus evidence must come from keyboard `Tab`, not only `locator.focus()`.

- [x] Extend an existing create-form journey: focus Subject, press Tab, assert Description is active and its computed focus treatment is visible.
- [x] Keep existing validation and visible alert assertions; add no redundant login flow.
- [x] Run the focused create spec; existing focus treatment passed, so no production CSS change was needed.

### Task 3: State coverage and checkpoint evidence

**Files:**
- Modify an existing Playwright spec only for a concrete missing assessment state.
- Create `evidence/checkpoints/TK-29.md` and `evidence/reviews/tk29-<date>-<sha>.md`.
- Update `evidence/checkpoints/acceptance-status.md` and `evidence/checkpoints/CURRENT_HANDOFF.md`.

**Interfaces:**
- Existing state cases: queue loading/empty/failure, create validation, detail permission/conflict, dashboard loading/failure, membership forbidden/last-admin.
- New state assertions must use deterministic route interception or guarded fixtures and must report their limits precisely.

- [x] Map existing state evidence before adding cases; current Playwright coverage already includes queue/dashboard loading and failure, queue/dashboard empty, create validation, forbidden access, and stale conflict. No duplicate state test was added.
- [x] Exercise the mobile workspace navigation by moving between Dashboard and Ticket queue at 375×812.
- [ ] Run `npm run check`, the guarded full browser suite, `py -3 scripts/check-doc-contract.py`, and `git diff --check`.
- [ ] Commit the verified source changes, obtain independent exact-SHA browser and static review via the parent-folder reviewer kit, then record evidence and the next checkpoint.
- [ ] Keep A22/A23/A37/G4 as NOT_RUN unless the entire acceptance contract is met; record scoped contributions otherwise.
