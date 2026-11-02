import { Client } from 'pg';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupFixtures, provisionFixtures } from './fixtures.js';
import { connectVerifiedTarget, type TargetMode } from './target.js';
import { rm } from 'node:fs/promises';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const VALUE_FLAGS = new Set(['--mode', '--expected-endpoint-id', '--expected-branch-id', '--expected-database', '--expected-user', '--run-id', '--output-dir', '--manifest']);
const SWITCH_FLAGS = new Set(['--confirm-preview-write', '--confirm-cleanup']);

function assertFlags(flags: ReturnType<typeof parseFlags>, values: string[], switches: string[] = []): void {
  if ([...flags.values.keys()].some((flag) => !values.includes(flag))
    || [...flags.switches].some((flag) => !switches.includes(flag))) {
    throw new Error('Unexpected argument supplied.');
  }
}

export function parseFlags(argv: string[]): { values: Map<string, string>; switches: Set<string> } {
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith('--')) throw new Error('Arguments must use named --flags.');
    if (SWITCH_FLAGS.has(flag)) {
      if (switches.has(flag)) throw new Error(`Duplicate flag: ${flag}`);
      switches.add(flag);
      continue;
    }
    if (!VALUE_FLAGS.has(flag)) throw new Error(`Unknown argument: ${flag}.`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--') || values.has(flag)) throw new Error(`Missing or duplicate value for ${flag}.`);
    values.set(flag, value);
    index += 1;
  }
  return { values, switches };
}

function required(values: Map<string, string>, flag: string): string {
  const value = values.get(flag);
  if (!value) throw new Error(`Required argument missing: ${flag}.`);
  return value;
}

function mode(value: string): TargetMode {
  if (value !== 'preview' && value !== 'local-test') throw new Error('--mode must be preview or local-test.');
  return value;
}

function connectionStringFor(targetMode: TargetMode): string {
  const value = process.env[targetMode === 'preview' ? 'PREVIEW_DIRECT_DATABASE_URL' : 'TEST_DATABASE_URL'];
  if (!value) throw new Error(`The required database URL environment variable is not set for ${targetMode} mode.`);
  return value;
}

function expected(values: Map<string, string>) {
  return {
    endpointId: required(values, '--expected-endpoint-id'),
    branchId: required(values, '--expected-branch-id'),
    database: required(values, '--expected-database'),
    username: required(values, '--expected-user'),
  };
}

async function withVerifiedTarget(argv: string[], writeIntent: boolean, action: (client: Client, identity: Awaited<ReturnType<typeof connectVerifiedTarget>>['identity'], flags: ReturnType<typeof parseFlags>) => Promise<void>) {
  const flags = parseFlags(argv);
  const targetMode = mode(required(flags.values, '--mode'));
  const expectedTarget = expected(flags.values);
  const { client, identity } = await connectVerifiedTarget({
    connectionString: connectionStringFor(targetMode),
    mode: targetMode,
    expected: expectedTarget,
    writeIntent,
    confirmPreviewWrite: flags.switches.has('--confirm-preview-write'),
  });
  try { await action(client, identity, flags); }
  finally { await client.end().catch(() => undefined); }
}

export async function verifyTargetCommand(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  assertFlags(flags, ['--mode', '--expected-endpoint-id', '--expected-branch-id', '--expected-database', '--expected-user']);
  await withVerifiedTarget(argv, false, async (_client, identity) => {
    console.log(JSON.stringify({ verified: true, target: identity }));
  });
}

export async function provisionCommand(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  assertFlags(flags, ['--mode', '--expected-endpoint-id', '--expected-branch-id', '--expected-database', '--expected-user', '--run-id', '--output-dir'], ['--confirm-preview-write']);
  await withVerifiedTarget(argv, true, async (client, identity, flags) => {
    const runId = required(flags.values, '--run-id');
    const outputDirectory = required(flags.values, '--output-dir');
    const result = await provisionFixtures({ client, target: identity, runId, outputDirectory, repositoryRoot });
    console.log(JSON.stringify({
      provisioned: true,
      runId,
      target: identity,
      organizations: result.manifest.organizations.length,
      accounts: result.manifest.users.length,
      tickets: result.manifest.tickets.length,
      credentialsFile: result.files.credentialsPath,
      sanitizedManifestFile: result.files.manifestPath,
      note: 'Passwords and password hashes were not printed.',
    }));
  });
}

export async function cleanupCommand(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  assertFlags(flags, ['--mode', '--expected-endpoint-id', '--expected-branch-id', '--expected-database', '--expected-user', '--run-id', '--manifest'], ['--confirm-cleanup', '--confirm-preview-write']);
  if (!flags.switches.has('--confirm-cleanup')) throw new Error('Cleanup requires --confirm-cleanup.');
  const targetMode = mode(required(flags.values, '--mode'));
  const runId = required(flags.values, '--run-id');
  const manifestPath = required(flags.values, '--manifest');
  const { client, identity } = await connectVerifiedTarget({
    connectionString: connectionStringFor(targetMode), mode: targetMode, expected: expected(flags.values),
    writeIntent: true, confirmPreviewWrite: flags.switches.has('--confirm-preview-write'),
  });
  try {
    const files = await cleanupFixtures({ client, target: identity, runId, manifestPath, repositoryRoot, confirm: true });
    await rm(files.credentialsPath, { force: true });
    await rm(files.manifestPath, { force: true });
    console.log(JSON.stringify({ cleaned: true, runId, target: identity, credentialFileRemoved: true, manifestRemoved: true }));
  } finally { await client.end().catch(() => undefined); }
}
