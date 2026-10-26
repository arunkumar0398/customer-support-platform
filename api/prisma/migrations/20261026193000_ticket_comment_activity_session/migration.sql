-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('TICKET_CREATED', 'TITLE_CHANGED', 'DESCRIPTION_CHANGED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNMENT_CHANGED', 'COMMENT_ADDED');

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "requesterUserId" UUID NOT NULL,
    "assigneeOrganizationId" UUID,
    "assigneeUserId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "type" "ActivityEventType" NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "lastSeenAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ticket_org_created_id_idx" ON "Ticket"("organizationId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Ticket_org_status_created_id_idx" ON "Ticket"("organizationId", "status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Ticket_org_priority_created_id_idx" ON "Ticket"("organizationId", "priority", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Ticket_org_requester_status_created_id_idx" ON "Ticket"("organizationId", "requesterUserId", "status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Ticket_org_assignee_status_created_id_idx" ON "Ticket"("organizationId", "assigneeUserId", "status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Ticket_org_due_status_idx" ON "Ticket"("organizationId", "dueAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_organizationId_id_key" ON "Ticket"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_organizationId_ticketNumber_key" ON "Ticket"("organizationId", "ticketNumber");

-- CreateIndex
CREATE INDEX "Comment_org_ticket_created_id_idx" ON "Comment"("organizationId", "ticketId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Comment_organizationId_id_key" ON "Comment"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ActivityEvent_org_ticket_created_id_idx" ON "ActivityEvent"("organizationId", "ticketId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_organizationId_id_key" ON "ActivityEvent"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_organizationId_requesterUserId_fkey" FOREIGN KEY ("organizationId", "requesterUserId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assigneeOrganizationId_assigneeUserId_fkey" FOREIGN KEY ("assigneeOrganizationId", "assigneeUserId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_organizationId_ticketId_fkey" FOREIGN KEY ("organizationId", "ticketId") REFERENCES "Ticket"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_organizationId_authorUserId_fkey" FOREIGN KEY ("organizationId", "authorUserId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_organizationId_ticketId_fkey" FOREIGN KEY ("organizationId", "ticketId") REFERENCES "Ticket"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_organizationId_actorUserId_fkey" FOREIGN KEY ("organizationId", "actorUserId") REFERENCES "Membership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The optional assignee relation has a nullable composite key. Keep its
-- duplicated organization scope aligned with the ticket tenant.
ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_assignee_scope_check"
    CHECK (
        ("assigneeUserId" IS NULL AND "assigneeOrganizationId" IS NULL)
        OR ("assigneeUserId" IS NOT NULL AND "assigneeOrganizationId" = "organizationId")
    );

ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_ticketNumber_positive_check" CHECK ("ticketNumber" > 0),
    ADD CONSTRAINT "Ticket_version_positive_check" CHECK ("version" > 0);
