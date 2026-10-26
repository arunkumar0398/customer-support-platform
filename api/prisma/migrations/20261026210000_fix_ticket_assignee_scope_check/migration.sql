-- PostgreSQL CHECK constraints accept an UNKNOWN/NULL result. Require both
-- nullable composite-FK columns explicitly when an assignee is present.
ALTER TABLE "Ticket"
    DROP CONSTRAINT "Ticket_assignee_scope_check";

ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_assignee_scope_check"
    CHECK (
        ("assigneeUserId" IS NULL AND "assigneeOrganizationId" IS NULL)
        OR (
            "assigneeUserId" IS NOT NULL
            AND "assigneeOrganizationId" IS NOT NULL
            AND "assigneeOrganizationId" = "organizationId"
        )
    );
