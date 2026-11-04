import { Client, type ClientConfig } from 'pg';
import { applicationTables, applicationTypes, localTestTarget, productionTarget, type LocalTestTarget, type ProductionTarget, type VerifiedTarget } from './profile.js';

export { productionTarget } from './profile.js';

type SafeProductionUrl = {
  hostname: string;
  port: number;
  database: string;
  username: string;
  tlsRequired: true;
};

type RuntimeRoleFlags = {
  superuser: boolean;
  createRole: boolean;
  createDatabase: boolean;
  bypassRls: boolean;
};

type TableGrant = { table: string; select: boolean; insert: boolean; update: boolean; delete: boolean; owns: boolean };
type RuntimeGrantSnapshot = {
  connect: boolean;
  schemaUsage: boolean;
  schemaCreate: boolean;
  databaseCreate: boolean;
  schemaOwner?: boolean;
  tablePrivileges: TableGrant[];
  typeUsage?: Array<{ type: string; usage: boolean }>;
};

const verifiedClients = new WeakMap<Client, { target: VerifiedTarget; writeApproved: boolean }>();

function parseUrl(connectionString: string): URL {
  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error('Database URL is invalid; its value is never printed.'); }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Target must use PostgreSQL.');
  const allowedParameters = new Set(['sslmode', 'application_name']);
  for (const key of url.searchParams.keys()) {
    if (!allowedParameters.has(key)) throw new Error('Unsupported database URL option; target verification refused.');
  }
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode && !['require', 'verify-full'].includes(sslMode.toLowerCase())) {
    throw new Error('Database URL must require TLS; weaker SSL modes are refused.');
  }
  if (url.hash) throw new Error('Database URL fragments are not supported.');
  return url;
}

function productionConnectionConfig(connectionString: string): { safe: SafeProductionUrl; config: ClientConfig } {
  const url = parseUrl(connectionString);
  const hostname = url.hostname.toLowerCase();
  const port = url.port ? Number(url.port) : 5432;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (hostname !== productionTarget.hostname || port !== productionTarget.port
    || database !== productionTarget.database || username !== productionTarget.username || !password) {
    throw new Error('Configured URL does not match the code-pinned Supabase Production host, database, and runtime role.');
  }
  const safe: SafeProductionUrl = { hostname, port, database, username, tlsRequired: true };
  const config: ClientConfig = {
    host: hostname,
    port,
    database,
    user: username,
    password,
    application_name: 'csp-production-demo-provisioner',
    connectionTimeoutMillis: 8000,
    ssl: { rejectUnauthorized: true },
  };
  return { safe, config };
}

export function parseProductionDatabaseUrl(connectionString: string): SafeProductionUrl {
  return productionConnectionConfig(connectionString).safe;
}

export function assertProductionDatabaseIdentity(identity: { database: string; username: string }): void {
  if (identity.database !== productionTarget.database || identity.username !== productionTarget.username) {
    throw new Error('Connected database identity does not match the approved Supabase Production target.');
  }
}

export function assertProductionRolePolicy(role: RuntimeRoleFlags, memberships: string[]): void {
  if (role.superuser || role.createRole || role.createDatabase || role.bypassRls || memberships.length > 0) {
    throw new Error('Runtime role is privileged or inherits another database role; provisioning refused.');
  }
}

export function assertProductionGrantPolicy(grants: RuntimeGrantSnapshot): void {
  if (!grants.connect || !grants.schemaUsage || grants.schemaCreate || grants.databaseCreate || grants.schemaOwner) {
    throw new Error('Runtime role database/schema privileges do not match the approved least-privilege policy.');
  }
  const byName = new Map(grants.tablePrivileges.map((row) => [row.table, row]));
  if (applicationTables.some((name) => {
    const row = byName.get(name);
    return !row || !row.select || !row.insert || !row.update || !row.delete || row.owns;
  }) || byName.size !== applicationTables.length) {
    throw new Error('Runtime role must have DML without ownership on exactly the application tables.');
  }
  if (grants.typeUsage && (grants.typeUsage.length !== applicationTypes.length
    || applicationTypes.some((name) => !grants.typeUsage?.some((row) => row.type === name && row.usage)))) {
    throw new Error('Runtime role lacks usage on an application enum type.');
  }
}

export function assertProvisioningClient(client: Client, target: VerifiedTarget, runId: string): void {
  const verified = verifiedClients.get(client);
  if (!verified || JSON.stringify(verified.target) !== JSON.stringify(target)) {
    throw new Error('Database client was not created by the exact target verifier; refusing fixture writes.');
  }
  if (target.provider === 'supabase' && !verified.writeApproved) {
    throw new Error('Production write has not been authorized by the interactive exact-scope confirmation.');
  }
  if (target.provider === 'supabase' && !/^prod-demo-\d{8}-[a-f0-9]{8}$/.test(runId)) {
    throw new Error('Production run ID must use the approved unique format.');
  }
}

export function authorizeProductionWrite(client: Client, typedProjectRef: string, typedRunId: string): void {
  const verified = verifiedClients.get(client);
  if (!verified || verified.target.provider !== 'supabase' || typedProjectRef !== productionTarget.projectRef
    || !/^prod-demo-\d{8}-[a-f0-9]{8}$/.test(typedRunId)) {
    throw new Error('Production write confirmation did not match the verified target and run ID.');
  }
  verified.writeApproved = true;
}

function safeClient(connectionString: string, target: VerifiedTarget): Client {
  if (target.provider === 'supabase') return new Client(productionConnectionConfig(connectionString).config);
  const url = parseUrl(connectionString);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(url.username);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())
    || database !== localTestTarget.database || username !== localTestTarget.username
    || (url.port && !['5432', '5433'].includes(url.port))) {
    throw new Error('Local fixture tests require the disposable loopback support_test/support_test database.');
  }
  return new Client({ connectionString, connectionTimeoutMillis: 5000 });
}

async function assertLocalIdentity(client: Client): Promise<void> {
  const result = await client.query('SELECT current_database() AS database, current_user AS username');
  if (result.rows[0]?.database !== localTestTarget.database || result.rows[0]?.username !== localTestTarget.username) {
    throw new Error('Connected identity does not match the disposable local test database.');
  }
}

async function assertProductionRole(client: Client): Promise<void> {
  const roleResult = await client.query(`
    SELECT r.rolsuper AS superuser, r.rolcreaterole AS "createRole",
           r.rolcreatedb AS "createDatabase", r.rolbypassrls AS "bypassRls"
    FROM pg_roles r WHERE r.rolname = current_user
  `);
  if (roleResult.rows.length !== 1) throw new Error('Runtime role metadata was unavailable.');
  const membershipResult = await client.query(`
    SELECT role.rolname
    FROM pg_roles AS role
    WHERE role.rolname <> current_user AND pg_has_role(current_user, role.oid, 'MEMBER')
    ORDER BY role.rolname
  `);
  assertProductionRolePolicy(roleResult.rows[0], membershipResult.rows.map((row) => row.rolname));

  const grantResult = await client.query(`
    WITH required(name) AS (SELECT unnest($1::text[]))
    SELECT current_database() AS database,
           has_database_privilege(current_user, current_database(), 'CONNECT') AS connect,
           has_database_privilege(current_user, current_database(), 'CREATE') AS "databaseCreate",
           has_schema_privilege(current_user, 'public', 'USAGE') AS "schemaUsage",
           has_schema_privilege(current_user, 'public', 'CREATE') AS "schemaCreate",
           (SELECT nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
              FROM pg_namespace WHERE nspname = 'public') AS "schemaOwner",
           coalesce(jsonb_agg(jsonb_build_object(
             'table', required.name,
             'exists', c.oid IS NOT NULL,
             'select', CASE WHEN c.oid IS NOT NULL THEN has_table_privilege(current_user, c.oid, 'SELECT') ELSE false END,
             'insert', CASE WHEN c.oid IS NOT NULL THEN has_table_privilege(current_user, c.oid, 'INSERT') ELSE false END,
             'update', CASE WHEN c.oid IS NOT NULL THEN has_table_privilege(current_user, c.oid, 'UPDATE') ELSE false END,
             'delete', CASE WHEN c.oid IS NOT NULL THEN has_table_privilege(current_user, c.oid, 'DELETE') ELSE false END,
             'owns', CASE WHEN c.oid IS NOT NULL THEN c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) ELSE false END
           ) ORDER BY required.name), '[]'::jsonb) AS tables
    FROM required
    LEFT JOIN pg_namespace n ON n.nspname = 'public'
    LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = required.name AND c.relkind IN ('r', 'p')
    GROUP BY database, connect, "databaseCreate", "schemaUsage", "schemaCreate", "schemaOwner"
  `, [applicationTables]);
  const grantRow = grantResult.rows[0];
  const tablePrivileges = grantRow.tables as TableGrant[];
  const typeResult = await client.query(`
    WITH required(name) AS (SELECT unnest($1::text[]))
    SELECT required.name AS type,
           coalesce(t.oid IS NOT NULL AND has_type_privilege(current_user, t.oid, 'USAGE'), false) AS usage
    FROM required
    LEFT JOIN pg_namespace n ON n.nspname = 'public'
    LEFT JOIN pg_type t ON t.typnamespace = n.oid AND t.typname = required.name
    ORDER BY required.name
  `, [applicationTypes]);
  assertProductionGrantPolicy({ ...grantRow, tablePrivileges, typeUsage: typeResult.rows });
}

async function connectVerified(connectionString: string, target: VerifiedTarget, writeApproved: boolean) {
  const client = safeClient(connectionString, target);
  try {
    await client.connect();
    if (target.provider === 'supabase') {
      const identityResult = await client.query('SELECT current_database() AS database, current_user AS username');
      assertProductionDatabaseIdentity(identityResult.rows[0]);
      await assertProductionRole(client);
    } else {
      await assertLocalIdentity(client);
    }
    verifiedClients.set(client, { target, writeApproved });
    return { client, target };
  } catch {
    await client.end().catch(() => undefined);
    throw new Error(target.provider === 'supabase'
      ? 'Supabase Production connection, identity, TLS, or least-privilege verification failed; no data was written.'
      : 'Disposable local database verification failed; no data was written.');
  }
}

export async function connectProductionTarget(connectionString: string) {
  const safe = parseProductionDatabaseUrl(connectionString);
  const target: ProductionTarget = { ...productionTarget, tls: 'verified' };
  const verified = await connectVerified(connectionString, target, false);
  return { ...verified, target, url: safe };
}

export async function connectLocalTestTarget(connectionString: string) {
  const target: LocalTestTarget = { ...localTestTarget, tls: 'local' };
  const verified = await connectVerified(connectionString, target, true);
  return { ...verified, target };
}
