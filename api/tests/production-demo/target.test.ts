import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductionTargetProfile } from '../../scripts/production-demo/profile.js';

const profileMock = vi.hoisted(() => ({ current: null as ProductionTargetProfile | null }));
vi.mock('../../scripts/production-demo/profile.js', () => ({
  getProductionTargetProfile: () => profileMock.current,
}));

import {
  assertVerifiedLocalTestTarget,
  assertVerifiedProductionTarget,
  verifyLocalTestTarget,
  verifyProductionTarget,
} from '../../scripts/production-demo/target.js';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const expected: ProductionTargetProfile = {
  projectId: 'demo-production-project',
  branchId: 'br-demo-production',
  endpointId: 'ep-demo-production',
  database: 'customer_support_prod',
  username: 'demo_provisioner',
};
const productionUrl = 'postgresql://demo_provisioner:private-db-secret@ep-demo-production.ap-southeast-1.aws.neon.tech/customer_support_prod?sslmode=require';
const apiKey = 'private-neon-api-key';
const directHost = 'ep-demo-production.ap-southeast-1.aws.neon.tech';

function response(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  } as Response;
}

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: {
      id: expected.endpointId,
      project_id: expected.projectId,
      branch_id: expected.branchId,
      host: directHost,
      type: 'read_write',
      ...overrides,
    },
  };
}

function fakeClient(identity: Partial<{ database: string; username: string }> = {}) {
  const actualIdentity = {
    database: expected.database,
    username: expected.username,
    ...identity,
  };
  const client = new Client({ connectionString: 'postgresql://test:test@localhost/test' });
  Object.assign(client, {
    connect: vi.fn(async () => undefined),
    query: vi.fn(async () => ({ rows: [actualIdentity] })),
    end: vi.fn(async () => undefined),
  });
  return client;
}

function productionOptions(overrides: Record<string, unknown> = {}) {
  profileMock.current = expected;
  const client = fakeClient();
  const fetchImpl = vi.fn(async () => response(endpoint()));
  const clientFactory = vi.fn(() => client);

  return {
    client,
    fetchImpl,
    clientFactory,
    options: {
      databaseUrl: productionUrl,
      neonApiKey: apiKey,
      fetchImpl,
      clientFactory,
      ...overrides,
    },
  };
}

describe('Production target verification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    profileMock.current = null;
  });

  it('returns a branded target only after exact Neon and PostgreSQL identities match', async () => {
    const setup = productionOptions();
    const verified = await verifyProductionTarget(setup.options);
    expect(() => assertVerifiedProductionTarget(verified)).not.toThrow();

    expect(verified.identity).toEqual({
      mode: 'production',
      projectId: expected.projectId,
      branchId: expected.branchId,
      endpointId: expected.endpointId,
      database: expected.database,
      username: expected.username,
    });
    expect(verified.client).toBe(setup.client);
    expect(setup.fetchImpl).toHaveBeenCalledTimes(1);
    const [requestedUrl, request] = setup.fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(requestedUrl).origin).toBe('https://console.neon.tech');
    expect(requestedUrl).toBe(
      `https://console.neon.tech/api/v2/projects/${expected.projectId}/endpoints/${expected.endpointId}`,
    );
    expect(request.method).toBe('GET');
    expect(request.redirect).toBe('error');
    expect(new Headers(request.headers).get('authorization')).toBe(`Bearer ${apiKey}`);
    expect(setup.client.query).toHaveBeenCalledWith(
      'SELECT current_database() AS database, current_user AS username',
    );
    expect(setup.clientFactory).toHaveBeenCalledWith(productionUrl, {
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      application_name: 'production-demo-target-verifier',
    });
  });

  it('fails closed when the code-owned Production profile is unset', async () => {
    profileMock.current = null;
    const setup = productionOptions();
    profileMock.current = null;
    await expect(verifyProductionTarget(setup.options)).rejects.toThrow(/profile is not configured/i);
    expect(setup.fetchImpl).not.toHaveBeenCalled();
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it('rejects an unbranded client and a result from the wrong environment', () => {
    const forged = {
      mode: 'production',
      identity: { mode: 'production' },
      client: fakeClient(),
    };

    expect(() => assertVerifiedProductionTarget(forged)).toThrow(/has not been verified/i);
    expect(() => assertVerifiedLocalTestTarget(forged)).toThrow(/has not been verified/i);
  });

  it('refuses missing target identity, database URL, or API key before external access', async () => {
    for (const overrides of [
      { databaseUrl: '' },
      { neonApiKey: '' },
    ]) {
      const setup = productionOptions(overrides);
      await expect(verifyProductionTarget(setup.options as never)).rejects.toThrow();
      expect(setup.fetchImpl).not.toHaveBeenCalled();
      expect(setup.clientFactory).not.toHaveBeenCalled();
    }
  });

  it('refuses loopback URLs before contacting Neon or PostgreSQL', async () => {
    const setup = productionOptions({
      databaseUrl: 'postgresql://demo_provisioner:secret@127.0.0.1/customer_support_prod?sslmode=require',
    });
    await expect(verifyProductionTarget(setup.options)).rejects.toThrow();
    expect(setup.fetchImpl).not.toHaveBeenCalled();
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it('refuses a non-default PostgreSQL port for Production before external access', async () => {
    const setup = productionOptions({
      databaseUrl: productionUrl.replace('.neon.tech/', '.neon.tech:5433/'),
    });
    await expect(verifyProductionTarget(setup.options)).rejects.toThrow();
    expect(setup.fetchImpl).not.toHaveBeenCalled();
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it('ignores caller-supplied Preview identity and refuses the Preview endpoint', async () => {
    const previewIdentity = {
      projectId: 'customer-support-platform-preview',
      branchId: 'production',
      endpointId: 'ep-preview-endpoint',
      database: 'support_test',
      username: 'support_test',
    };
    const setup = productionOptions({
      databaseUrl: 'postgresql://support_test:secret@ep-preview-endpoint.ap-southeast-1.aws.neon.tech/support_test?sslmode=require',
    });
    const attempted = {
      ...setup.options,
      expected: previewIdentity,
    } as typeof setup.options;

    await expect(verifyProductionTarget(attempted)).rejects.toThrow();
    expect(setup.fetchImpl).not.toHaveBeenCalled();
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it.each([
    ['development database', 'support_dev', 'demo_provisioner'],
    ['test database', 'support_test', 'demo_provisioner'],
    ['development role', expected.database, 'support_dev'],
    ['test role', expected.database, 'support_test'],
    ['postgres superuser', expected.database, 'postgres'],
  ])('refuses a local-only %s before contacting Neon or PostgreSQL', async (_label, database, username) => {
    const target = { ...expected, database, username };
    profileMock.current = target;
    const setup = productionOptions({
      databaseUrl: `postgresql://${username}:secret@${directHost}/${database}?sslmode=require`,
    });
    profileMock.current = target;
    await expect(verifyProductionTarget(setup.options)).rejects.toThrow();
    expect(setup.fetchImpl).not.toHaveBeenCalled();
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it('refuses pooled Neon hosts even when the URL credentials otherwise match', async () => {
    const setup = productionOptions({
      databaseUrl: productionUrl.replace(directHost, 'ep-demo-production-pooler.ap-southeast-1.aws.neon.tech'),
    });
    await expect(verifyProductionTarget(setup.options)).rejects.toThrow();
    expect(setup.fetchImpl).not.toHaveBeenCalled();
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it.each([
    ['project', { project_id: 'other-project' }],
    ['branch', { branch_id: 'br-preview-branch' }],
    ['endpoint', { id: 'ep-other-endpoint' }],
    ['hostname', { host: 'ep-other-endpoint.ap-southeast-1.aws.neon.tech' }],
    ['writability', { type: 'read_only' }],
  ])('refuses a Neon %s mismatch before opening PostgreSQL', async (_label, mismatch) => {
    const setup = productionOptions({ fetchImpl: vi.fn(async () => response(endpoint(mismatch))) });
    await expect(verifyProductionTarget(setup.options)).rejects.toThrow();
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it('refuses metadata that omits the project identity', async () => {
    const metadata = endpoint();
    const endpointWithoutProject = Object.fromEntries(
      Object.entries(metadata.endpoint).filter(([key]) => key !== 'project_id'),
    );
    const setup = productionOptions({
      fetchImpl: vi.fn(async () => response({ endpoint: endpointWithoutProject })),
    });

    await expect(verifyProductionTarget(setup.options)).rejects.toThrow();
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it('refuses a Preview branch returned for the explicitly expected Production branch', async () => {
    const setup = productionOptions({
      fetchImpl: vi.fn(async () => response(endpoint({ branch_id: 'br-preview-branch' }))),
    });
    await expect(verifyProductionTarget(setup.options)).rejects.toThrow();
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it.each([
    ['database', { database: 'other_database' }],
    ['role', { username: 'other_role' }],
  ])('closes the connection and refuses a PostgreSQL %s mismatch', async (_label, identity) => {
    const client = fakeClient(identity);
    const setup = productionOptions({ clientFactory: vi.fn(() => client) });
    await expect(verifyProductionTarget(setup.options)).rejects.toThrow();
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('fails closed on Neon API errors and does not leak the URL or key', async () => {
    const setup = productionOptions({ fetchImpl: vi.fn(async () => response({ message: apiKey }, false)) });
    let message = '';
    try {
      await verifyProductionTarget(setup.options);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(apiKey);
    expect(message).not.toContain(productionUrl);
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it('fails closed on an unrecognized Neon response shape', async () => {
    const setup = productionOptions({ fetchImpl: vi.fn(async () => response({ endpoints: [] })) });
    await expect(verifyProductionTarget(setup.options)).rejects.toThrow();
    expect(setup.clientFactory).not.toHaveBeenCalled();
  });

  it('bounds and sanitizes a timed-out PostgreSQL identity query', async () => {
    const client = fakeClient();
    client.query = vi.fn(async () => {
      throw new Error(`${productionUrl} ${apiKey}`);
    }) as unknown as Client['query'];
    const clientFactory = vi.fn(() => client);
    const setup = productionOptions({ clientFactory });
    let message = '';

    try {
      await verifyProductionTarget(setup.options);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(client.query).toHaveBeenCalledWith(
      'SELECT current_database() AS database, current_user AS username',
    );
    expect(clientFactory).toHaveBeenCalledWith(productionUrl, {
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      application_name: 'production-demo-target-verifier',
    });
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(message).not.toContain(productionUrl);
    expect(message).not.toContain(apiKey);
  });
});

describe('local-test target verification', () => {
  it('refuses development and remote target URLs without connecting', async () => {
    for (const databaseUrl of [
      'postgresql://support_dev:secret@localhost:5433/support_dev?sslmode=disable',
      'postgresql://support_test:secret@db.example.test:5433/support_test',
      'postgresql://support_test:secret@localhost:5433/support_dev?host=db.example.test',
    ]) {
      const clientFactory = vi.fn(() => fakeClient());
      await expect(verifyLocalTestTarget({ databaseUrl, clientFactory })).rejects.toThrow();
      expect(clientFactory).not.toHaveBeenCalled();
    }
  });

  it('brands a local-test target only after the disposable identity matches', async () => {
    const client = fakeClient({ database: 'support_test', username: 'support_test' });
    const verified = await verifyLocalTestTarget({
      databaseUrl: 'postgresql://support_test:secret@127.0.0.1:5433/support_test?schema=public',
      clientFactory: vi.fn(() => client),
    });

    expect(() => assertVerifiedLocalTestTarget(verified)).not.toThrow();
    expect(() => assertVerifiedProductionTarget(verified)).toThrow(/has not been verified/i);
    await verified.client.end();
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)('verifies the real disposable support_test database and role', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL must identify disposable support_test.');

    const verified = await verifyLocalTestTarget({ databaseUrl: databaseUrl! });
    try {
      expect(() => assertVerifiedLocalTestTarget(verified)).not.toThrow();
      expect(verified.identity).toEqual({
        mode: 'local-test',
        projectId: 'local',
        branchId: 'local',
        endpointId: 'local',
        database: 'support_test',
        username: 'support_test',
      });
      expect(verified.client).toBeInstanceOf(Client);
    } finally {
      await verified.client.end();
    }
  });
});
