import { Client } from 'pg';

export type TargetMode = 'local-test' | 'preview';
export type ExpectedTarget = { endpointId: string; database: string; username: string; branchId: string };
export type VerifiedTarget = ExpectedTarget & { mode: TargetMode; hostname: string };

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);
const verifiedClients = new WeakMap<Client, { identity: VerifiedTarget; writeApproved: boolean }>();

export function assertVerifiedTargetClient(client: Client, target: VerifiedTarget, writeIntent = true): void {
  const verified = verifiedClients.get(client);
  if (!verified) throw new Error('Database client was not created by the target verifier; refusing fixture access.');
  if (verified.identity.mode !== target.mode || verified.identity.endpointId !== target.endpointId
    || verified.identity.branchId !== target.branchId || verified.identity.database !== target.database
    || verified.identity.username !== target.username || verified.identity.hostname !== target.hostname) {
    throw new Error('Database client identity does not match the fixture target; refusing fixture access.');
  }
  if (writeIntent && !verified.writeApproved) throw new Error('Verified database client is read-only for this operation.');
}

export function parseAndValidateTargetUrl(connectionString: string, mode: TargetMode, expected: ExpectedTarget): URL {
  let target: URL;
  try { target = new URL(connectionString); }
  catch { throw new Error('Database URL is invalid; its value is never printed.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('Target must use PostgreSQL.');
  if (decodeURIComponent(target.pathname.slice(1)) !== expected.database
    || decodeURIComponent(target.username) !== expected.username) {
    throw new Error('Configured URL database or username does not match the explicitly expected target.');
  }
  for (const key of target.searchParams.keys()) {
    if (!['schema', 'sslmode', 'channel_binding', 'application_name'].includes(key)) {
      throw new Error(`Unsupported database URL option: ${key}.`);
    }
  }
  if (target.searchParams.has('schema') && target.searchParams.get('schema') !== 'public') {
    throw new Error('Only the public database schema is supported for fixture operations.');
  }
  const hostname = target.hostname.toLowerCase();
  if (mode === 'local-test') {
    if (!LOOPBACK.has(hostname) || expected.endpointId !== 'local' || expected.branchId !== 'local'
      || expected.database !== 'support_test' || expected.username !== 'support_test') {
      throw new Error('Local-test mode is restricted to endpointId=local, branchId=local, loopback, and support_test/support_test.');
    }
  } else {
    if (!/^[a-z0-9-]{8,64}$/.test(expected.endpointId)
      || !/^br-[a-z0-9-]{6,64}$/.test(expected.branchId)
      || hostname.split('.')[0] !== expected.endpointId || !hostname.endsWith('.neon.tech') || LOOPBACK.has(hostname)
      || !['', '5432'].includes(target.port)) {
      throw new Error('Preview mode requires the exact expected direct Neon endpoint hostname.');
    }
  }
  return target;
}

export async function connectVerifiedTarget(options: {
  connectionString: string;
  mode: TargetMode;
  expected: ExpectedTarget;
  writeIntent?: boolean;
  confirmPreviewWrite?: boolean;
}): Promise<{ client: Client; identity: VerifiedTarget }> {
  const url = parseAndValidateTargetUrl(options.connectionString, options.mode, options.expected);
  if (options.mode === 'preview' && options.writeIntent && !options.confirmPreviewWrite) {
    throw new Error('Preview writes require the explicit --confirm-preview-write acknowledgement.');
  }
  const client = new Client({
    connectionString: (() => {
      const safeUrl = new URL(options.connectionString);
      // Never let connection-string SSL flags weaken the explicit TLS policy below.
      safeUrl.searchParams.delete('sslmode');
      // `schema=public` is Prisma-specific and is not a PostgreSQL connection option.
      safeUrl.searchParams.delete('schema');
      return safeUrl.toString();
    })(),
    connectionTimeoutMillis: 5000,
    ssl: options.mode === 'preview' ? { rejectUnauthorized: true } : undefined,
  });
  try {
    await client.connect();
    const result = await client.query('SELECT current_database() AS database, current_user AS username');
    const row = result.rows[0];
    if (row?.database !== options.expected.database || row?.username !== options.expected.username) {
      throw new Error('Connected PostgreSQL identity does not match the explicitly expected database and role.');
    }
    const identity = { ...options.expected, mode: options.mode, hostname: url.hostname.toLowerCase() };
    verifiedClients.set(client, {
      identity,
      writeApproved: options.writeIntent === true
        && (options.mode === 'local-test' || options.confirmPreviewWrite === true),
    });
    return { client, identity };
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}
