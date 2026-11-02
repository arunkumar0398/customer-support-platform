# Manual screen-reader acceptance script — A37

**Status: NOT_RUN.** This is a prepared human test script, not an accessibility result. Run only on the local seeded disposable database; use synthetic credentials and no hosted services.

## Record before starting

- Operator and date/time:
- OS and version:
- Browser and version:
- Screen reader and version / speech verbosity:
- Application commit and local start command:
- Database identity verified as disposable (`support_test`):
- Viewport / zoom / display scaling:

## Journey

1. **Sign in:** start with screen-reader browse mode. Identify page title, Email and Password labels, required state, Sign in button, and any status text. Submit invalid credentials once. Confirm the error is announced, associated with the form, and focus is moved or remains at a useful control. Correct credentials and sign in by keyboard only.
2. **Queue:** identify the page heading and main landmark. Navigate filters and search with keyboard; confirm each control has a useful accessible name and selected values are announced. Move through the ticket list and identify each ticket’s subject, status, priority, requester, and link purpose. Check empty/loading/error text if the local fixture supports each state; otherwise record N/A and why.
3. **Create:** activate the create-ticket link/button. Navigate requester, subject, description, and priority in logical order. Submit an invalid form. Confirm required/invalid state and error text are announced and linked to the fields. Correct values and create a synthetic ticket; confirm a useful success announcement and destination.
4. **Detail and comment:** identify the ticket heading/status. Navigate editable fields and Save without a mouse. Change one permitted field, save, then confirm the updated value and activity state are announced. Move to the comment region, identify its heading/list and comment form, submit a synthetic comment, and confirm the new comment is announced without losing context.
5. **Failure and recovery:** with a local-only controlled failure, trigger a detail or comment request error. Confirm the error is announced, the retry control has an accessible name, keyboard activation retries, and focus is not lost. If no safe local fault control is available, record that recovery branch NOT_RUN.
6. **Logout:** locate the account/logout control through landmarks and keyboard navigation. Sign out, confirm the signed-out state/title is announced, then use browser Back and verify protected content is not exposed.

## Result record

| Step | Expected announcement/operation | Observed announcement/operation | Pass/fail/N/A | Issue and reproduction |
|---|---|---|---|---|
| Sign in + validation |  |  |  |  |
| Queue + filters |  |  |  |  |
| Create + validation |  |  |  |  |
| Detail + update |  |  |  |  |
| Comment |  |  |  |  |
| Failure + retry |  |  |  |  |
| Logout + Back |  |  |  |  |

Capture sanitized notes only. Do not attach passwords, cookies, email identifiers, or real user data. A37 closes only after an actual human run and triage of observed failures; axe output or automated role locators are not a substitute.
