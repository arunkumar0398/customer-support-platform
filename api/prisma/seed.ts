import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const organizations = [
  { id: '10000000-0000-4000-8000-000000000001', slug: 'alpha-support', name: 'Alpha Support' },
  { id: '10000000-0000-4000-8000-000000000002', slug: 'beta-support', name: 'Beta Support' },
] as const;

const createdAt = '2026-10-01T12:00:00.000Z';

const accounts = [
  {
    id: '20000000-0000-4000-8000-000000000001', organizationId: organizations[0].id,
    email: 'admin.alpha@example.test', role: 'ADMIN',
    passwordHash: '$scrypt$32768$8$1$8692409daee6ad8dab3a0862400b4225$a9693bbd9490134f56b33d315e507c812fca73285075d77cf150b8e88ac4327c',
  },
  {
    id: '20000000-0000-4000-8000-000000000002', organizationId: organizations[0].id,
    email: 'agent.alpha@example.test', role: 'AGENT',
    passwordHash: '$scrypt$32768$8$1$9ccdf66555071baaae86070937713d81$86365a7220ed6af3ef965e810b34bdb4fd05474d343cf124035f96dc5318bec4',
  },
  {
    id: '20000000-0000-4000-8000-000000000003', organizationId: organizations[0].id,
    email: 'customer.alpha.one@example.test', role: 'CUSTOMER',
    passwordHash: '$scrypt$32768$8$1$87017c53cdc1ee8e9ed28d728087d248$b1c3b4ecb20e34314db95f6e06c05235b4fe1c57437b7b2ea62f9d60e702cb0c',
  },
  {
    id: '20000000-0000-4000-8000-000000000004', organizationId: organizations[0].id,
    email: 'customer.alpha.two@example.test', role: 'CUSTOMER',
    passwordHash: '$scrypt$32768$8$1$d36d51c62ab7740af268af62ef80b95b$c4514911c0f02f6208ec7d1edabfae1278a9931ec8035806e3b36dcc8d635e29',
  },
  {
    id: '20000000-0000-4000-8000-000000000005', organizationId: organizations[1].id,
    email: 'admin.beta@example.test', role: 'ADMIN',
    passwordHash: '$scrypt$32768$8$1$a19307a98f18cc710a6cf677a2b2b9aa$9662b5f96b968517bcbf514130dba95fad3442feb0089cff1666e8a354e778bd',
  },
  {
    id: '20000000-0000-4000-8000-000000000006', organizationId: organizations[1].id,
    email: 'agent.beta@example.test', role: 'AGENT',
    passwordHash: '$scrypt$32768$8$1$944d751a45261e2cdec9cb8f0ca848fc$8de5a4bf4edfbc62112158abfa16c321a1d78a29b6556834aff71bde2652a618',
  },
  {
    id: '20000000-0000-4000-8000-000000000007', organizationId: organizations[1].id,
    email: 'customer.beta.one@example.test', role: 'CUSTOMER',
    passwordHash: '$scrypt$32768$8$1$150fe2dae6e9fef665ef32e9367ae1a2$08e194aedc9e34194205789993ee609d4ed0f56b4debb9e49976988fbe8fcb42',
  },
  {
    id: '20000000-0000-4000-8000-000000000008', organizationId: organizations[1].id,
    email: 'customer.beta.two@example.test', role: 'CUSTOMER',
    passwordHash: '$scrypt$32768$8$1$7c92e8bc36cb4ddaf366b1bdd51e563e$c69d898952e7a128297c96e58603a2591e41be8919f1ff681f65166e889cadbd',
  },
] as const;

const tickets = [
  { id: '30000000-0000-4000-8000-000000000001', organizationId: organizations[0].id, number: 1, requesterId: '20000000-0000-4000-8000-000000000003', assigneeId: '20000000-0000-4000-8000-000000000002', title: 'Demo: Alpha customer one printer outage', status: 'OPEN', priority: 'URGENT', dueAt: '2026-01-15T00:00:00.000Z' },
  { id: '30000000-0000-4000-8000-000000000002', organizationId: organizations[0].id, number: 2, requesterId: '20000000-0000-4000-8000-000000000004', assigneeId: '20000000-0000-4000-8000-000000000002', title: 'Demo: Alpha customer two invoice mismatch', status: 'IN_PROGRESS', priority: 'HIGH', dueAt: '2026-12-15T00:00:00.000Z' },
  { id: '30000000-0000-4000-8000-000000000003', organizationId: organizations[0].id, number: 3, requesterId: '20000000-0000-4000-8000-000000000004', assigneeId: null, title: 'Demo: Alpha customer two resolved access issue', status: 'RESOLVED', priority: 'LOW', dueAt: null },
  { id: '30000000-0000-4000-8000-000000000004', organizationId: organizations[0].id, number: 4, requesterId: '20000000-0000-4000-8000-000000000003', assigneeId: '20000000-0000-4000-8000-000000000002', title: 'Demo: Alpha customer one closed delivery question', status: 'CLOSED', priority: 'MEDIUM', dueAt: null },
  { id: '30000000-0000-4000-8000-000000000005', organizationId: organizations[1].id, number: 1, requesterId: '20000000-0000-4000-8000-000000000007', assigneeId: '20000000-0000-4000-8000-000000000006', title: 'Demo: Beta customer one account lockout', status: 'OPEN', priority: 'MEDIUM', dueAt: '2026-02-01T00:00:00.000Z' },
  { id: '30000000-0000-4000-8000-000000000006', organizationId: organizations[1].id, number: 2, requesterId: '20000000-0000-4000-8000-000000000008', assigneeId: '20000000-0000-4000-8000-000000000006', title: 'Demo: Beta customer two urgent data export', status: 'IN_PROGRESS', priority: 'URGENT', dueAt: '2026-12-20T00:00:00.000Z' },
  { id: '30000000-0000-4000-8000-000000000007', organizationId: organizations[1].id, number: 3, requesterId: '20000000-0000-4000-8000-000000000008', assigneeId: null, title: 'Demo: Beta customer two resolved plan question', status: 'RESOLVED', priority: 'HIGH', dueAt: null },
  { id: '30000000-0000-4000-8000-000000000008', organizationId: organizations[1].id, number: 4, requesterId: '20000000-0000-4000-8000-000000000007', assigneeId: '20000000-0000-4000-8000-000000000006', title: 'Demo: Beta customer one closed billing question', status: 'CLOSED', priority: 'LOW', dueAt: null },
] as const;

export async function seedDatabase(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const organization of organizations) {
      await client.query(
        `INSERT INTO "Organization" ("id", "slug", "name", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT ("id") DO UPDATE
           SET "slug" = EXCLUDED."slug", "name" = EXCLUDED."name", "updatedAt" = EXCLUDED."updatedAt"`,
        [organization.id, organization.slug, organization.name, createdAt],
      );
    }

    for (const account of accounts) {
      await client.query(
        `INSERT INTO "User" ("id", "email", "passwordHash", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT ("id") DO UPDATE
           SET "email" = EXCLUDED."email", "passwordHash" = EXCLUDED."passwordHash", "updatedAt" = EXCLUDED."updatedAt"`,
        [account.id, account.email, account.passwordHash, createdAt],
      );
      await client.query(
        `INSERT INTO "Membership" ("organizationId", "userId", "role", "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, TRUE, $4, $4)
         ON CONFLICT ("organizationId", "userId") DO UPDATE
           SET "role" = EXCLUDED."role", "isActive" = TRUE, "updatedAt" = EXCLUDED."updatedAt"`,
        [account.organizationId, account.id, account.role, createdAt],
      );
    }

    for (const ticket of tickets) {
      const assigneeOrganizationId = ticket.assigneeId ? ticket.organizationId : null;
      const description = `${ticket.title.replace('Demo: ', '')}. This is a synthetic assessment fixture.`;
      await client.query(
        `INSERT INTO "Ticket" ("id", "organizationId", "ticketNumber", "requesterUserId",
            "assigneeOrganizationId", "assigneeUserId", "title", "description", "status", "priority",
            "dueAt", "version", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12, $12)
         ON CONFLICT ("id") DO UPDATE SET
            "organizationId" = EXCLUDED."organizationId", "ticketNumber" = EXCLUDED."ticketNumber",
            "requesterUserId" = EXCLUDED."requesterUserId", "assigneeOrganizationId" = EXCLUDED."assigneeOrganizationId",
            "assigneeUserId" = EXCLUDED."assigneeUserId", "title" = EXCLUDED."title",
            "description" = EXCLUDED."description", "status" = EXCLUDED."status", "priority" = EXCLUDED."priority",
            "dueAt" = EXCLUDED."dueAt", "version" = EXCLUDED."version",
            "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt"`,
        [ticket.id, ticket.organizationId, ticket.number, ticket.requesterId, assigneeOrganizationId,
          ticket.assigneeId, ticket.title, description, ticket.status, ticket.priority, ticket.dueAt, createdAt],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function assertLocalDevelopmentDatabaseUrl(connectionString: string): void {
  let target: URL;
  try {
    target = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  const database = decodeURIComponent(target.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(target.username);
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(target.hostname.toLowerCase());
  const hasOnlySchemaOption = [...target.searchParams.keys()].every((key) => key === 'schema');

  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || database !== 'support_dev' || username !== 'support_dev' || !isLoopback || !hasOnlySchemaOption) {
    throw new Error('Refusing demo seed access: DATABASE_URL must identify the local support_dev database and role.');
  }
}

async function runLocalSeed(): Promise<void> {
  const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for the local demo seed.');
  assertLocalDevelopmentDatabaseUrl(connectionString);

  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const identity = await client.query('SELECT current_database() AS database, current_user AS username');
    if (identity.rows[0]?.database !== 'support_dev' || identity.rows[0]?.username !== 'support_dev') {
      throw new Error('Connected database identity does not match the local support_dev target.');
    }
    await seedDatabase(client);
    console.info('Synthetic demo fixtures applied to local support_dev.');
  } finally {
    await client.end();
  }
}

if (process.argv.includes('--run')) {
  runLocalSeed().catch(() => {
    console.error('Local demo seed failed. Check that support_dev is running and all migrations are applied.');
    process.exitCode = 1;
  });
}
