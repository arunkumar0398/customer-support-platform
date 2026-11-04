import { describe, expect, it } from 'vitest';
import {
  assertProductionDatabaseIdentity,
  assertProductionGrantPolicy,
  assertProductionRunAuthorization,
  assertProductionRolePolicy,
  parseProductionDatabaseUrl,
  productionTarget,
} from '../../../scripts/supabase-production-demo/target.js';
import { parseProvisionArguments, verifyTypedProductionConfirmation } from '../../../scripts/supabase-production-demo/cli.js';

const validUrl = 'postgresql://csp_prod_runtime:synthetic-test-only@db.ityzntsmumvtktjjdacs.supabase.co:5432/postgres?sslmode=require';

describe('fixed Supabase Production target', () => {
  it('pins the project, region, direct host, database, and runtime login in code', () => {
    expect(productionTarget).toEqual({
      provider: 'supabase',
      projectRef: 'ityzntsmumvtktjjdacs',
      region: 'ap-northeast-2',
      branchLabel: 'main / PRODUCTION',
      hostname: 'db.ityzntsmumvtktjjdacs.supabase.co',
      port: 5432,
      database: 'postgres',
      username: 'csp_prod_runtime',
    });
  });

  it('parses the exact direct target while forcing certificate-validated TLS', () => {
    const parsed = parseProductionDatabaseUrl(validUrl);
    expect(parsed).toMatchObject({
      hostname: productionTarget.hostname,
      port: 5432,
      database: 'postgres',
      username: 'csp_prod_runtime',
      tlsRequired: true,
    });
    expect(JSON.stringify(parsed)).not.toContain('synthetic-test-only');
  });

  it.each([
    ['local database', 'postgresql://support_test:fake@localhost:5432/support_test'],
    ['Neon', 'postgresql://csp_prod_runtime:fake@ep-something.neon.tech:5432/postgres'],
    ['another Supabase project', 'postgresql://csp_prod_runtime:fake@db.otherproject.supabase.co:5432/postgres'],
    ['transaction pooler', 'postgresql://csp_prod_runtime.fake@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres'],
    ['wrong port', 'postgresql://csp_prod_runtime:fake@db.ityzntsmumvtktjjdacs.supabase.co:6543/postgres'],
    ['wrong database', 'postgresql://csp_prod_runtime:fake@db.ityzntsmumvtktjjdacs.supabase.co:5432/support_dev'],
    ['wrong login', 'postgresql://postgres:fake@db.ityzntsmumvtktjjdacs.supabase.co:5432/postgres'],
    ['TLS disabled', 'postgresql://csp_prod_runtime:fake@db.ityzntsmumvtktjjdacs.supabase.co:5432/postgres?sslmode=disable'],
    ['host override', 'postgresql://csp_prod_runtime:fake@db.ityzntsmumvtktjjdacs.supabase.co:5432/postgres?host=localhost'],
    ['local Prisma schema option', 'postgresql://csp_prod_runtime:fake@db.ityzntsmumvtktjjdacs.supabase.co:5432/postgres?schema=public'],
    ['SSL verification override', 'postgresql://csp_prod_runtime:fake@db.ityzntsmumvtktjjdacs.supabase.co:5432/postgres?sslmode=no-verify'],
  ])('refuses %s before connecting', (_caseName, connectionString) => {
    expect(() => parseProductionDatabaseUrl(connectionString)).toThrow();
  });

  it('refuses malformed URLs without returning connection details', () => {
    expect(() => parseProductionDatabaseUrl('not a URL')).toThrow('Database URL is invalid');
  });

  it('requires PostgreSQL to report the exact approved database and runtime role', () => {
    expect(() => assertProductionDatabaseIdentity({ database: 'postgres', username: 'csp_prod_runtime' })).not.toThrow();
    expect(() => assertProductionDatabaseIdentity({ database: 'support_dev', username: 'csp_prod_runtime' })).toThrow();
    expect(() => assertProductionDatabaseIdentity({ database: 'postgres', username: 'postgres' })).toThrow();
  });

  it('rejects administrative role attributes and all inherited role memberships', () => {
    const safeRole = { superuser: false, createRole: false, createDatabase: false, bypassRls: false };
    expect(() => assertProductionRolePolicy(safeRole, [])).not.toThrow();
    expect(() => assertProductionRolePolicy({ ...safeRole, superuser: true }, [])).toThrow();
    expect(() => assertProductionRolePolicy({ ...safeRole, createRole: true }, [])).toThrow();
    expect(() => assertProductionRolePolicy({ ...safeRole, createDatabase: true }, [])).toThrow();
    expect(() => assertProductionRolePolicy({ ...safeRole, bypassRls: true }, [])).toThrow();
    expect(() => assertProductionRolePolicy(safeRole, ['supabase_admin'])).toThrow();
  });

  it('requires app DML, schema usage, and non-ownership while refusing DDL grants', () => {
    const tablePrivileges = ['Organization', 'User', 'Membership', 'Ticket', 'Comment', 'ActivityEvent', 'Session']
      .map((table) => ({ table, select: true, insert: true, update: true, delete: true, owns: false }));
    const typeUsage = ['MembershipRole', 'TicketStatus', 'TicketPriority', 'ActivityEventType']
      .map((type) => ({ type, usage: true, owns: false }));
    const safe = { connect: true, schemaUsage: true, schemaCreate: false, databaseCreate: false, tablePrivileges, typeUsage };
    expect(() => assertProductionGrantPolicy(safe)).not.toThrow();
    expect(() => assertProductionGrantPolicy({ ...safe, schemaCreate: true })).toThrow();
    expect(() => assertProductionGrantPolicy({ ...safe, databaseCreate: true })).toThrow();
    expect(() => assertProductionGrantPolicy({ ...safe, tablePrivileges: tablePrivileges.slice(1) })).toThrow();
    expect(() => assertProductionGrantPolicy({ ...safe, tablePrivileges: tablePrivileges.map((row, index) => index === 0 ? { ...row, owns: true } : row) })).toThrow();
    expect(() => assertProductionGrantPolicy({ ...safe, tablePrivileges: tablePrivileges.map((row, index) => index === 3 ? { ...row, delete: false } : row) })).toThrow();
    expect(() => assertProductionGrantPolicy({ ...safe, additionalPrivileges: true })).toThrow();
    expect(() => assertProductionGrantPolicy({
      ...safe,
      typeUsage: typeUsage.map((row, index) => index === 1 ? { ...row, owns: true } : row),
    })).toThrow(/enum|type/i);
  });

  it('binds a confirmed Production write capability to one exact run ID', () => {
    const runA = 'prod-demo-20261104-a1b2c3d4';
    const runB = 'prod-demo-20261104-b1b2c3d4';
    expect(() => assertProductionRunAuthorization(runA, runA)).not.toThrow();
    expect(() => assertProductionRunAuthorization(runA, runB)).toThrow(/run ID/i);
    expect(() => assertProductionRunAuthorization(undefined, runA)).toThrow(/run ID/i);
  });
});

describe('Production provision command contract', () => {
  it('requires a run ID, output directory, and explicit Production acknowledgement', () => {
    expect(() => parseProvisionArguments(['--run-id', 'prod-demo-20261104-a1b2c3d4', '--output-dir', 'C:\\private']))
      .toThrow('Production write acknowledgement is required');
    expect(parseProvisionArguments([
      '--run-id', 'prod-demo-20261104-a1b2c3d4', '--output-dir', 'C:\\private', '--confirm-production-write',
    ])).toEqual({ runId: 'prod-demo-20261104-a1b2c3d4', outputDirectory: 'C:\\private' });
  });

  it('rejects attempts to override mode, provider, project, database, host, or role', () => {
    for (const flag of ['--mode', '--expected-project-ref', '--expected-host', '--expected-user', '--database-url']) {
      expect(() => parseProvisionArguments([
        '--run-id', 'prod-demo-20261104-a1b2c3d4', '--output-dir', 'C:\\private',
        '--confirm-production-write', flag, 'attacker-controlled',
      ])).toThrow();
    }
  });

  it('requires typed confirmation to exactly match both project and run ID', () => {
    const runId = 'prod-demo-20261104-a1b2c3d4';
    expect(() => verifyTypedProductionConfirmation(productionTarget.projectRef, runId, productionTarget.projectRef, runId)).not.toThrow();
    expect(() => verifyTypedProductionConfirmation('other-project', runId, productionTarget.projectRef, runId)).toThrow();
    expect(() => verifyTypedProductionConfirmation(productionTarget.projectRef, 'other-run-id', productionTarget.projectRef, runId)).toThrow();
  });
});
