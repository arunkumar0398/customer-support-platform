-- Read-only assertions for the restored local A36 snapshot.
DO $$
BEGIN
  IF current_database() <> 'support_test_recovery' OR current_user <> 'support_test' THEN
    RAISE EXCEPTION 'A36 restore verification requires support_test_recovery/support_test';
  END IF;
  IF (SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'restored migration history is incomplete';
  END IF;
  IF (SELECT count(*) FROM "Organization") <> 2
     OR (SELECT count(*) FROM "User") <> 2
     OR (SELECT count(*) FROM "Membership") <> 2
     OR (SELECT count(*) FROM "Ticket") <> 1
     OR (SELECT count(*) FROM "Comment") <> 1
     OR (SELECT count(*) FROM "ActivityEvent") <> 1
     OR (SELECT count(*) FROM "Session") <> 1 THEN
    RAISE EXCEPTION 'restored synthetic row counts differ from snapshot';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN (
    'User_email_normalized_check',
    'Ticket_assignee_scope_check',
    'Ticket_ticketNumber_positive_check',
    'Ticket_version_positive_check'
  )) <> 4 THEN
    RAISE EXCEPTION 'restored application check constraints are incomplete';
  END IF;
  IF to_regclass('public."Ticket_organizationId_id_key"') IS NULL
     OR to_regclass('public."Ticket_org_status_created_id_idx"') IS NULL
     OR to_regclass('public."Comment_org_ticket_created_id_idx"') IS NULL
     OR to_regclass('public."ActivityEvent_org_ticket_created_id_idx"') IS NULL THEN
    RAISE EXCEPTION 'restored tenant-scoped indexes are incomplete';
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
