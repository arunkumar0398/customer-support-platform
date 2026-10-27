import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from './database-identity.mjs';

const ROW_COUNT = 50_000;
const TENANT_COUNT = 10;
const STATUS = 'OPEN';

export function buildTicketListExplainQueries(organizationId) {
  const listSql = 'SELECT "id", "organizationId", "ticketNumber", "requesterUserId", "assigneeUserId", "title", "status", "priority", "dueAt", "version", "createdAt", "updatedAt" FROM "Ticket" WHERE "organizationId" = $1 AND "status" = $2 ORDER BY "createdAt" DESC, "id" DESC LIMIT $3 OFFSET $4';
  return [
    { name: 'status-first-page', sql: listSql, values: [organizationId, STATUS, 25, 0] },
    { name: 'status-deep-page', sql: listSql, values: [organizationId, STATUS, 100, 2_400] },
    {
      name: 'status-count',
      sql: 'SELECT count(*) FROM "Ticket" WHERE "organizationId" = $1 AND "status" = $2',
      values: [organizationId, STATUS],
    },
    {
      name: 'substring-search',
      sql: 'SELECT "id", "createdAt" FROM "Ticket" WHERE "organizationId" = $1 AND "status" = $2 AND ("title" ILIKE $3 OR "description" ILIKE $3) ORDER BY "createdAt" DESC, "id" DESC LIMIT $4 OFFSET $5',
      values: [organizationId, STATUS, '%needle-not-present%', 25, 0],
    },
  ];
}

function summarizePlan(plan) {
  const nodes = [];
  const visit = (node) => {
    nodes.push({
      node: node['Node Type'],
      index: node['Index Name'] ?? null,
      relation: node['Relation Name'] ?? null,
      planRows: node['Plan Rows'],
      actualRows: node['Actual Rows'],
      actualMs: node['Actual Total Time'],
      sharedHit: node['Shared Hit Blocks'],
      sharedRead: node['Shared Read Blocks'],
      ...(node['Sort Method'] ? { sortMethod: node['Sort Method'] } : {}),
    });
    for (const child of node.Plans ?? []) visit(child);
  };
  visit(plan);
  return nodes;
}

async function main() {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL is required; refusing to assess an unspecified database.');
  }

  const expected = assertSafeTestDatabaseUrl(connectionString);
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  const organizationIds = Array.from({ length: TENANT_COUNT }, () => randomUUID());
  const userIds = Array.from({ length: TENANT_COUNT }, () => randomUUID());
  const targetOrganizationId = organizationIds[0];
  let transactionStarted = false;

  try {
    await client.connect();
    const identity = await client.query('SELECT current_database() AS database, current_user AS username');
    assertActualTestDatabase(identity.rows[0], expected);
    if (identity.rows[0].database !== 'support_test' || identity.rows[0].username !== 'support_test') {
      throw new Error('Refusing performance fixture: expected the guarded support_test identity.');
    }

    const version = await client.query("SELECT current_setting('server_version') AS server_version");
    console.log('PostgreSQL server: ' + version.rows[0].server_version);

    await client.query('BEGIN');
    transactionStarted = true;
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    for (let i = 0; i < TENANT_COUNT; i++) {
      await client.query(
        'INSERT INTO "Organization" ("id", "slug", "name") VALUES ($1, $2, $3)',
        [organizationIds[i], 'explain-' + organizationIds[i], 'Synthetic query plan organization ' + (i + 1)],
      );
      await client.query(
        'INSERT INTO "User" ("id", "email", "passwordHash") VALUES ($1, $2, $3)',
        [userIds[i], 'explain-' + userIds[i] + '@example.test', 'synthetic-benchmark-hash-not-a-credential'],
      );
      await client.query(
        'INSERT INTO "Membership" ("organizationId", "userId", "role") VALUES ($1, $2, $3::"MembershipRole")',
        [organizationIds[i], userIds[i], 'CUSTOMER'],
      );
    }
    await client.query(
      'INSERT INTO "Ticket" ("id", "organizationId", "ticketNumber", "requesterUserId", "title", "description", "status", "priority", "createdAt", "updatedAt") ' +
      'SELECT gen_random_uuid(), ($1::uuid[])[((n - 1) % $4::integer) + 1], ((n - 1) / $4::integer) + 1, ' +
      '($2::uuid[])[((n - 1) % $4::integer) + 1], $3 || n::text, $5 || n::text, ' +
      "CASE WHEN (((n - 1) / $4::integer) + 1) % 2 = 0 THEN $q$OPEN$q$::\"TicketStatus\" ELSE $q$IN_PROGRESS$q$::\"TicketStatus\" END, " +
      "$q$MEDIUM$q$::\"TicketPriority\", now() - (($6::integer - n) * interval '1 second'), now() " +
      'FROM generate_series(1, $6::integer) AS n',
      [organizationIds, userIds, 'Synthetic ticket ', TENANT_COUNT, 'Synthetic description ', ROW_COUNT],
    );
    const fixture = await client.query('SELECT count(*)::int AS total, count(*) FILTER (WHERE "status" = $2::"TicketStatus")::int AS open FROM "Ticket" WHERE "organizationId" = $1', [targetOrganizationId, STATUS]);
    if (fixture.rows[0].total !== ROW_COUNT / TENANT_COUNT || fixture.rows[0].open !== ROW_COUNT / TENANT_COUNT / 2) {
      throw new Error('Synthetic fixture distribution check failed.');
    }
    await client.query('ANALYZE "Ticket"');

    console.log('Synthetic fixture: ' + ROW_COUNT + ' tickets across ' + TENANT_COUNT + ' disposable organizations; target has ' + fixture.rows[0].total + ' rows / ' + fixture.rows[0].open + ' OPEN; transaction will be rolled back.');
    for (const query of buildTicketListExplainQueries(targetOrganizationId)) {
      const result = await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + query.sql, query.values);
      const plan = result.rows[0]['QUERY PLAN'][0].Plan;
      console.log(JSON.stringify({ query: query.name, plan: summarizePlan(plan) }));
    }
  } finally {
    if (transactionStarted) {
      await client.query('ROLLBACK');
      const result = await client.query('SELECT count(*)::int AS count FROM "Organization" WHERE "id" = ANY($1::uuid[])', [organizationIds]);
      if (result.rows[0].count !== 0) throw new Error('Synthetic query-plan organizations remained after rollback.');
      console.log('Rollback verified: no synthetic organizations remain.');
    }
    await client.end().catch(() => undefined);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error('Ticket list plan assessment failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  });
}
