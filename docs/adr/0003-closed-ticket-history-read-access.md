# ADR 0003 — Closed ticket history remains readable

Status: implementation clarification within the approved tenant/ownership model; independent review status is recorded in the TK-10 checkpoint.

## Context

Assessment page 1, sections 2–3 require customers to view/comment on their own tickets and require conversation plus meaningful change history. The assessment asks us to define precise permissions; it does not specify that closing a ticket hides its conversation or audit history.

The approved design combined “Comment/read history” in one row labelled non-closed tickets. The harness's underlying default restricts **new comments** on closed tickets and separately preserves append-only audit history. Combining these in one row unintentionally applied a write restriction to historical reads.

## Decision

Split the permission into two rows. Authorized staff can read their organization's ticket history, and customers can read their own, including after closure. New comments remain restricted to visible non-closed tickets. Reading closed history does not reopen the ticket or authorize any mutation. All organization/customer visibility boundaries remain enforced.

## Consequences and evidence

This corrects the ambiguous design row and preserves reviewable history after the lifecycle ends. The restriction on adding comments to closed tickets is a project assumption, not an employer requirement. TK-10 policy tests cover visibility across statuses and deny foreign/other-customer access before revealing closed-state restrictions. Actual history/comment API and browser acceptance remains TK-19/TK-26 and later gates. Relevant acceptance: A04–A06, A14–A15.
