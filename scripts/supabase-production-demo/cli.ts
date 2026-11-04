import { productionTarget } from './profile.js';
import type { ProductionTarget } from './profile.js';
import { connectProductionTarget } from './target.js';

type ProvisionArguments = { runId: string; outputDirectory: string };

export function parseProvisionArguments(argv: string[]): ProvisionArguments {
  const values = new Map<string, string>();
  const switches = new Set<string>();
  const valueFlags = new Set(['--run-id', '--output-dir']);
  const switchFlags = new Set(['--confirm-production-write']);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag?.startsWith('--')) throw new Error('Arguments must use named --flags.');
    if (switchFlags.has(flag)) {
      if (switches.has(flag)) throw new Error(`Duplicate flag: ${flag}`);
      switches.add(flag);
      continue;
    }
    if (!valueFlags.has(flag)) throw new Error('Unknown argument supplied; target and database URL overrides are not supported.');
    const value = argv[index + 1];
    if (!value || value.startsWith('--') || values.has(flag)) throw new Error(`Missing or duplicate value for ${flag}.`);
    values.set(flag, value);
    index += 1;
  }
  if (!switches.has('--confirm-production-write')) throw new Error('Production write acknowledgement is required.');
  const runId = values.get('--run-id');
  const outputDirectory = values.get('--output-dir');
  if (!runId || !/^prod-demo-\d{8}-[a-f0-9]{8}$/.test(runId)) {
    throw new Error('Run ID must be unique and match prod-demo-YYYYMMDD-xxxxxxxx.');
  }
  if (!outputDirectory) throw new Error('Required argument missing: --output-dir.');
  return { runId, outputDirectory };
}

export function verifyTypedProductionConfirmation(
  typedProjectRef: string,
  typedRunId: string,
  expectedProjectRef: string,
  expectedRunId: string,
): void {
  if (typedProjectRef !== expectedProjectRef || typedRunId !== expectedRunId) {
    throw new Error('Typed Production project/run confirmation did not match; no data was written.');
  }
}

async function requireProductionUrl(): Promise<string> {
  const connectionString = process.env.SUPABASE_PRODUCTION_DIRECT_DATABASE_URL;
  if (!connectionString) throw new Error('SUPABASE_PRODUCTION_DIRECT_DATABASE_URL is not set in this operator process.');
  return connectionString;
}

function sanitizedTarget(target: ProductionTarget) {
  return {
    provider: target.provider,
    projectRef: target.projectRef,
    region: target.region,
    branchLabel: target.branchLabel,
    hostname: target.hostname,
    port: target.port,
    database: target.database,
    username: target.username,
  };
}

export async function verifyProductionTargetCommand(argv: string[] = []): Promise<void> {
  if (argv.length) throw new Error('The read-only verifier accepts no command-line arguments.');
  const { client, target } = await connectProductionTarget(await requireProductionUrl());
  try {
    console.log(JSON.stringify({ verified: true, target: sanitizedTarget(target), tls: 'certificate-validated' }));
  } finally {
    await client.end().catch(() => undefined);
  }
}
