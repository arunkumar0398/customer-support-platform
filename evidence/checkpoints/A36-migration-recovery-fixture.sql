-- Local-only fixture for A36 migration/recovery rehearsal.
-- Run only in a disposable PostgreSQL container whose database and role are
-- both named support_test. These identifiers and password hashes are synthetic.
DO $$
BEGIN
  IF current_database() <> 'support_test' OR current_user <> 'support_test' THEN
    RAISE EXCEPTION 'A36 fixture requires the disposable support_test identity';
  END IF;
END $$;

INSERT INTO "Organization" ("id", "slug", "name")
VALUES
  ('a3600000-0000-4000-8000-000000000001', 'a36-alpha', 'A36 Synthetic Alpha'),
  ('a3600000-0000-4000-8000-000000000002', 'a36-beta', 'A36 Synthetic Beta')
ON CONFLICT DO NOTHING;

INSERT INTO "User" ("id", "email", "passwordHash")
VALUES
  ('a3600000-0000-4000-8000-000000000011', 'a36-customer@example.test', 'not-a-login-credential'),
  ('a3600000-0000-4000-8000-000000000012', 'a36-agent@example.test', 'not-a-login-credential')
ON CONFLICT DO NOTHING;

INSERT INTO "Membership" ("organizationId", "userId", "role", "isActive")
VALUES
  ('a3600000-0000-4000-8000-000000000001', 'a3600000-0000-4000-8000-000000000011', 'CUSTOMER', true),
  ('a3600000-0000-4000-8000-000000000001', 'a3600000-0000-4000-8000-000000000012', 'AGENT', true)
ON CONFLICT DO NOTHING;

INSERT INTO "Ticket" (
  "id", "organizationId", "ticketNumber", "requesterUserId",
  "assigneeOrganizationId", "assigneeUserId", "title", "description"
)
VALUES (
  'a3600000-0000-4000-8000-000000000021',
  'a3600000-0000-4000-8000-000000000001',
  1,
  'a3600000-0000-4000-8000-000000000011',
  'a3600000-0000-4000-8000-000000000001',
  'a3600000-0000-4000-8000-000000000012',
  'A36 synthetic recovery ticket',
  'Disposable migration restore fixture.'
)
ON CONFLICT DO NOTHING;

INSERT INTO "Comment" ("id", "organizationId", "ticketId", "authorUserId", "body")
VALUES (
  'a3600000-0000-4000-8000-000000000031',
  'a3600000-0000-4000-8000-000000000001',
  'a3600000-0000-4000-8000-000000000021',
  'a3600000-0000-4000-8000-000000000011',
  'Synthetic comment for local restore verification.'
)
ON CONFLICT DO NOTHING;

INSERT INTO "ActivityEvent" ("id", "organizationId", "ticketId", "actorUserId", "type", "newValue")
VALUES (
  'a3600000-0000-4000-8000-000000000041',
  'a3600000-0000-4000-8000-000000000001',
  'a3600000-0000-4000-8000-000000000021',
  'a3600000-0000-4000-8000-000000000012',
  'TICKET_CREATED',
  '{"source":"a36-disposable"}'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO "Session" ("id", "userId", "tokenHash", "expiresAt")
VALUES (
  'a3600000-0000-4000-8000-000000000051',
  'a3600000-0000-4000-8000-000000000011',
  repeat('a', 64),
  CURRENT_TIMESTAMP + INTERVAL '1 day'
)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'expected all three Prisma migrations to be applied';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN (
    'User_email_normalized_check',
    'Ticket_assignee_scope_check',
    'Ticket_ticketNumber_positive_check',
    'Ticket_version_positive_check'
  )) <> 4 THEN
    RAISE EXCEPTION 'expected the four application check constraints';
  END IF;
  IF to_regclass('public."Ticket_organizationId_id_key"') IS NULL
     OR to_regclass('public."Ticket_org_status_created_id_idx"') IS NULL
     OR to_regclass('public."Comment_org_ticket_created_id_idx"') IS NULL
     OR to_regclass('public."ActivityEvent_org_ticket_created_id_idx"') IS NULL THEN
    RAISE EXCEPTION 'expected tenant-scoped lookup indexes';
  END IF;
END $$;

SELECT 'organizations' AS table_name, count(*) AS rows FROM "Organization"
UNION ALL SELECT 'users', count(*) FROM "User"
UNION ALL SELECT 'memberships', count(*) FROM "Membership"
UNION ALL SELECT 'tickets', count(*) FROM "Ticket"
UNION ALL SELECT 'comments', count(*) FROM "Comment"
UNION ALL SELECT 'activity_events', count(*) FROM "ActivityEvent"
UNION ALL SELECT 'sessions', count(*) FROM "Session"
UNION ALL SELECT 'applied_migrations', count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
ORDER BY table_name;
