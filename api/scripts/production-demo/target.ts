import { Client } from 'pg';
import { getProductionTargetProfile, type ProductionTargetProfile } from './profile.js';

const NEON_API_ORIGIN = 'https://console.neon.tech/api/v2';
const POSTGRES_IDENTITY_QUERY = 'SELECT current_database() AS database, current_user AS username';
const TARGET_QUERY_TIMEOUT_MS = 5000;
const LOCAL_ONLY_NAMES = new Set(['support_dev', 'support_test', 'postgres']);
const verifiedClientBrand: unique symbol = Symbol('verified-production-demo-client');

export interface VerifiedTargetIdentity extends ProductionTargetProfile {
  mode: 'production' | 'local-test';
}

export type VerifiedPgClient = Client & { readonly [verifiedClientBrand]: true };

export interface VerifiedProductionTarget {
  readonly mode: 'production';
  readonly client: VerifiedPgClient;
  readonly identity: VerifiedTargetIdentity;
}

export interface VerifiedLocalTestTarget {
  readonly mode: 'local-test';
  readonly client: VerifiedPgClient;
  readonly identity: VerifiedTargetIdentity;
}

interface TargetVerifierDependencies {
  clientFactory?: (
    connectionString: string,
    config: { connectionTimeoutMillis: number; query_timeout: number; application_name: string },
  ) => Client;
}

export interface VerifyProductionTargetOptions extends TargetVerifierDependencies {
  databaseUrl: string;
  neonApiKey: string;
  fetchImpl?: typeof fetch;
}

export interface VerifyLocalTestTargetOptions extends TargetVerifierDependencies {
  databaseUrl: string;
}

const EXPECTED_ID = /^[a-z0-9-]{1,80}$/;
const EXPECTED_ENDPOINT_ID = /^ep-[a-z0-9-]{1,80}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function validateExpectedTarget(expected: ProductionTargetProfile): void {
  if (!isRecord(expected)
    || !nonEmpty(expected.projectId) || !EXPECTED_ID.test(expected.projectId)
    || !nonEmpty(expected.branchId) || !EXPECTED_ID.test(expected.branchId)
    || !nonEmpty(expected.endpointId) || !EXPECTED_ENDPOINT_ID.test(expected.endpointId)
    || !nonEmpty(expected.database) || !/^[a-zA-Z0-9_-]{1,63}$/.test(expected.database)
    || !nonEmpty(expected.username) || !/^[a-zA-Z0-9_.-]{1,63}$/.test(expected.username)) {
    fail('Expected Production target identity is invalid.');
  }

  if (LOCAL_ONLY_NAMES.has(expected.database.toLowerCase())
    || LOCAL_ONLY_NAMES.has(expected.username.toLowerCase())) {
    fail('Local-only database identities cannot be used for Production.');
  }
}

function parseDatabaseUrl(databaseUrl: unknown): URL {
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0 || databaseUrl.length > 4096) {
    fail('Database target URL is missing or invalid.');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail('Database target URL is invalid.');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    fail('Database target URL must use PostgreSQL.');
  }
  if (parsed.hash) {
    fail('Database target URL options are not supported.');
  }
  return parsed;
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    fail('Database target URL is invalid.');
  }
}

function parsePathnameDatabase(pathname: string): string {
  const encodedDatabase = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  if (!encodedDatabase || encodedDatabase.includes('/')) fail('Database target URL is invalid.');
  return decoded(encodedDatabase);
}

function validateProductionUrl(databaseUrl: string, expected: ProductionTargetProfile): URL {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (parsed.port && parsed.port !== '5432') {
    fail('Production database URL must use the default PostgreSQL port.');
  }
  const host = parsed.hostname.toLowerCase();
  const directNeonHost = host.startsWith(`${expected.endpointId.toLowerCase()}.`)
    && host.endsWith('.neon.tech')
    && !host.includes('-pooler');

  if (!directNeonHost || LOOPBACK_HOSTS.has(host) || netIsIp(host)) {
    fail('Production database URL must use the expected direct Neon endpoint.');
  }

  const username = decoded(parsed.username);
  const database = parsePathnameDatabase(parsed.pathname);
  if (username !== expected.username || database !== expected.database) {
    fail('Production database URL identity does not match the expected target.');
  }
  if (LOCAL_ONLY_NAMES.has(username.toLowerCase()) || LOCAL_ONLY_NAMES.has(database.toLowerCase())) {
    fail('Local-only database identities cannot be used for Production.');
  }

  const queryKeys = [...parsed.searchParams.keys()];
  if (queryKeys.length !== 1
    || queryKeys[0] !== 'sslmode'
    || parsed.searchParams.get('sslmode') !== 'require') {
    fail('Production database URL must require TLS and use only supported options.');
  }
  if (!parsed.password) fail('Production database URL is incomplete.');
  return parsed;
}

function netIsIp(host: string): boolean {
  // Neon endpoint hostnames are DNS names; reject IPv4 and IPv6 literals without
  // introducing a dependency or echoing the supplied URL.
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

async function fetchEndpointMetadata(
  options: VerifyProductionTargetOptions,
  expected: ProductionTargetProfile,
  hostname: string,
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${NEON_API_ORIGIN}/projects/${encodeURIComponent(expected.projectId)}`
    + `/endpoints/${encodeURIComponent(expected.endpointId)}`;

  let result: Response;
  try {
    result = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${options.neonApiKey}`,
      },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    fail('Neon target metadata could not be verified.');
  }

  if (!result.ok) fail('Neon target metadata could not be verified.');

  let body: unknown;
  try {
    body = await result.json();
  } catch {
    fail('Neon target metadata response was invalid.');
  }
  if (!isRecord(body) || !isRecord(body.endpoint)) {
    fail('Neon target metadata response was invalid.');
  }

  const endpoint = body.endpoint;
  if (endpoint.id !== expected.endpointId
    || endpoint.branch_id !== expected.branchId
    || endpoint.host !== hostname
    || endpoint.type !== 'read_write'
    || endpoint.project_id !== expected.projectId) {
    fail('Neon target metadata does not match the expected Production identity.');
  }
}

function makeClient(connectionString: string, factory?: TargetVerifierDependencies['clientFactory']): Client {
  const config = {
    connectionTimeoutMillis: TARGET_QUERY_TIMEOUT_MS,
    query_timeout: TARGET_QUERY_TIMEOUT_MS,
    application_name: 'production-demo-target-verifier',
  };
  return factory
    ? factory(connectionString, config)
    : new Client({ connectionString, ...config });
}

async function verifyConnectedIdentity(
  client: Client,
  database: string,
  username: string,
): Promise<void> {
  try {
    await client.connect();
    const result = await client.query<{ database: string; username: string }>(POSTGRES_IDENTITY_QUERY);
    const row = result.rows[0];
    if (!row || row.database !== database || row.username !== username) {
      fail('Connected PostgreSQL identity does not match the expected target.');
    }
  } catch {
    await client.end().catch(() => undefined);
    fail('PostgreSQL target identity could not be verified.');
  }
}

function brandClient(client: Client): VerifiedPgClient {
  Object.defineProperty(client, verifiedClientBrand, { value: true, enumerable: false });
  return client as VerifiedPgClient;
}

function assertVerifiedTargetKind(
  value: unknown,
  kind: VerifiedTargetIdentity['mode'],
): void {
  if (!isRecord(value)
    || value.mode !== kind
    || !isRecord(value.identity)
    || value.identity.mode !== kind
    || !(value.client instanceof Client)
    || Object.getOwnPropertyDescriptor(value.client, verifiedClientBrand)?.value !== true) {
    fail('Target has not been verified for the required environment.');
  }
}

export function assertVerifiedProductionTarget(
  value: unknown,
): asserts value is VerifiedProductionTarget {
  assertVerifiedTargetKind(value, 'production');
}

export function assertVerifiedLocalTestTarget(
  value: unknown,
): asserts value is VerifiedLocalTestTarget {
  assertVerifiedTargetKind(value, 'local-test');
}

export async function verifyProductionTarget(
  options: VerifyProductionTargetOptions,
): Promise<VerifiedProductionTarget> {
  if (!isRecord(options)) fail('Production target verification options are invalid.');
  const expected = getProductionTargetProfile();
  if (!expected) fail('Trusted Production target profile is not configured.');
  validateExpectedTarget(expected);
  if (!nonEmpty(options.neonApiKey)) fail('Neon API credential is required.');

  const parsed = validateProductionUrl(options.databaseUrl, expected);
  await fetchEndpointMetadata(options, expected, parsed.hostname.toLowerCase());

  const client = makeClient(options.databaseUrl, options.clientFactory);
  await verifyConnectedIdentity(client, expected.database, expected.username);

  return {
    mode: 'production',
    client: brandClient(client),
    identity: { mode: 'production', ...expected },
  };
}

function validateLocalTestUrl(databaseUrl: string): void {
  const parsed = parseDatabaseUrl(databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const database = parsePathnameDatabase(parsed.pathname);
  const username = decoded(parsed.username);

  if (!LOOPBACK_HOSTS.has(host)
    || database !== 'support_test'
    || username !== 'support_test') {
    fail('Local-test target is restricted to loopback support_test/support_test.');
  }

  for (const key of parsed.searchParams.keys()) {
    if (!['schema', 'sslmode'].includes(key)) {
      fail('Local-test database URL contains unsupported options.');
    }
  }
  if (parsed.searchParams.has('schema') && parsed.searchParams.get('schema') !== 'public') {
    fail('Local-test target is restricted to the public schema.');
  }
  if (parsed.searchParams.has('sslmode') && parsed.searchParams.get('sslmode') !== 'disable') {
    fail('Local-test target has unsupported TLS options.');
  }
}

export async function verifyLocalTestTarget(
  options: VerifyLocalTestTargetOptions,
): Promise<VerifiedLocalTestTarget> {
  if (!isRecord(options) || typeof options.databaseUrl !== 'string') {
    fail('Local-test database URL is required.');
  }
  validateLocalTestUrl(options.databaseUrl);

  const client = makeClient(options.databaseUrl, options.clientFactory);
  await verifyConnectedIdentity(client, 'support_test', 'support_test');

  return {
    mode: 'local-test',
    client: brandClient(client),
    identity: {
      mode: 'local-test',
      projectId: 'local',
      branchId: 'local',
      endpointId: 'local',
      database: 'support_test',
      username: 'support_test',
    },
  };
}
