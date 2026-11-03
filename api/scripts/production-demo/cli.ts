import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import {
  preparePrivateRunOutput,
  readPrivateRunManifest,
  type PreparedPrivateRunOutput,
} from './output.js';
import { getProductionTargetProfile, type ProductionTargetProfile } from './profile.js';
import { provisionPersistentDemo, verifyExistingPersistentDemo, type DemoRunManifest } from './provision.js';
import { verifyProductionTarget, type VerifiedProductionTarget } from './target.js';

export interface ProductionDemoArguments extends ProductionTargetProfile {
  readonly mode: 'production';
  readonly action: 'provision' | 'verify-existing';
  readonly runId: string;
  readonly credentialDirectory: string;
}

interface CliDependencies {
  readonly env?: NodeJS.ProcessEnv;
  readonly stdinIsTTY?: boolean;
  readonly stdoutIsTTY?: boolean;
  readonly repositoryRoot?: string;
  readonly verifyTarget?: typeof verifyProductionTarget;
  readonly prepareOutput?: typeof preparePrivateRunOutput;
  readonly readManifest?: typeof readPrivateRunManifest;
  readonly provision?: typeof provisionPersistentDemo;
  readonly verifyExisting?: typeof verifyExistingPersistentDemo;
  readonly prompt?: (message: string) => Promise<string>;
  readonly stdout?: (message: string) => void;
  readonly stderr?: (message: string) => void;
}

const FLAG_TO_FIELD = new Map<string, keyof ProductionTargetProfile | 'mode' | 'runId' | 'credentialDirectory'>([
  ['--mode', 'mode'],
  ['--project-id', 'projectId'],
  ['--branch-id', 'branchId'],
  ['--endpoint-id', 'endpointId'],
  ['--database', 'database'],
  ['--username', 'username'],
  ['--run-id', 'runId'],
  ['--credential-dir', 'credentialDirectory'],
]);

function fail(message: string): never {
  throw new Error(message);
}

export function parseProductionDemoArguments(argv: readonly string[]): ProductionDemoArguments {
  const values = new Map<string, string>();
  let verifyExisting = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--verify-existing') {
      if (verifyExisting) fail('Production demo arguments are invalid.');
      verifyExisting = true;
      continue;
    }
    if (!FLAG_TO_FIELD.has(flag) || values.has(flag)) fail('Production demo arguments are invalid.');
    const value = argv[index + 1];
    if (!value || value.startsWith('--') || value.trim() !== value) fail('Production demo arguments are invalid.');
    values.set(flag, value);
    index += 1;
  }

  if (!values.has('--mode')) fail('Production demo mode must be explicitly selected.');
  for (const flag of FLAG_TO_FIELD.keys()) {
    if (!values.has(flag)) fail('Production demo arguments are incomplete.');
  }
  const profile = getProductionTargetProfile();
  if (!profile) fail('Trusted Production target profile is not configured.');
  if (values.get('--mode') !== 'production'
    || values.get('--project-id') !== profile.projectId
    || values.get('--branch-id') !== profile.branchId
    || values.get('--endpoint-id') !== profile.endpointId
    || values.get('--database') !== profile.database
    || values.get('--username') !== profile.username) {
    fail('Requested identity does not match the code-owned Production target.');
  }

  const runId = values.get('--run-id')!;
  if (!/^demo-[a-z0-9](?:[a-z0-9-]{6,58}[a-z0-9])?$/.test(runId)) {
    fail('Production demo run ID is invalid.');
  }
  const credentialDirectory = values.get('--credential-dir')!;
  if (!isAbsolute(credentialDirectory)) fail('Credential destination must be an absolute path.');

  return {
    mode: 'production',
    action: verifyExisting ? 'verify-existing' : 'provision',
    ...profile,
    runId,
    credentialDirectory,
  };
}

function isCiEnvironment(env: NodeJS.ProcessEnv): boolean {
  const truthy = (value: string | undefined): boolean => Boolean(value && value !== '0' && value.toLowerCase() !== 'false');
  return truthy(env.CI) || truthy(env.GITHUB_ACTIONS) || truthy(env.VERCEL);
}

function terminalConfirmation(message: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  return terminal.question(message).finally(() => terminal.close());
}

function manifestCounts(manifest: DemoRunManifest): string {
  return `organizations=${manifest.counts.organizations} accounts=${manifest.counts.users} tickets=${manifest.counts.tickets}`;
}

function targetSummary(target: VerifiedProductionTarget): string {
  const { projectId, branchId, endpointId, database, username } = target.identity;
  return `target project=${projectId} branch=${branchId} endpoint=${endpointId} database=${database} role=${username}`;
}

/** Testable orchestration; dependencies are injectable so tests never contact Neon or a database. */
export async function runProductionDemoCli(
  argv: readonly string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const stdout = dependencies.stdout ?? ((message: string) => process.stdout.write(`${message}\n`));
  const stderr = dependencies.stderr ?? ((message: string) => process.stderr.write(`${message}\n`));
  let target: VerifiedProductionTarget | undefined;
  let output: PreparedPrivateRunOutput | undefined;
  let completed = false;
  let preserveRecoveryOutput = false;

  try {
    const parsed = parseProductionDemoArguments(argv);
    if (parsed.action === 'provision'
      && (dependencies.stdinIsTTY ?? process.stdin.isTTY) !== true) {
      fail('Production demo provisioning requires an interactive terminal.');
    }
    if (parsed.action === 'provision'
      && (dependencies.stdoutIsTTY ?? process.stdout.isTTY) !== true) {
      fail('Production demo provisioning requires an interactive terminal.');
    }
    if (isCiEnvironment(env)) fail('Production demo provisioning is disabled in CI and hosted build environments.');
    const databaseUrl = env.PRODUCTION_DEMO_DATABASE_URL;
    const neonApiKey = env.NEON_API_KEY;
    if (!databaseUrl || !neonApiKey) fail('Private Production database and Neon API environment values are required.');

    const verifyTarget = dependencies.verifyTarget ?? verifyProductionTarget;
    target = await verifyTarget({ databaseUrl, neonApiKey });
    if (target.identity.projectId !== parsed.projectId || target.identity.branchId !== parsed.branchId
      || target.identity.endpointId !== parsed.endpointId || target.identity.database !== parsed.database
      || target.identity.username !== parsed.username) {
      fail('Verified Production target does not match the requested identity.');
    }

    const repositoryRoot = dependencies.repositoryRoot ?? resolve(process.cwd(), '..');
    if (parsed.action === 'verify-existing') {
      const reader = dependencies.readManifest ?? readPrivateRunManifest;
      const manifestValue = await reader(parsed.credentialDirectory, repositoryRoot, parsed.runId);
      if (!manifestValue || typeof manifestValue !== 'object' || Array.isArray(manifestValue)
        || !('runId' in manifestValue) || manifestValue.runId !== parsed.runId) {
        fail('Private run manifest does not match the requested run ID.');
      }
      const verifier = dependencies.verifyExisting ?? verifyExistingPersistentDemo;
      const manifest = await verifier(target, manifestValue);
      stdout(`Verified existing Production demo run ${parsed.runId}: ${targetSummary(target)} ${manifestCounts(manifest)}.`);
      completed = true;
      return 0;
    }

    const prompt = dependencies.prompt ?? terminalConfirmation;
    const expectedConfirmation = `${parsed.projectId} ${parsed.runId}`;
    const entered = await prompt(`Type exactly "${expectedConfirmation}" to continue: `);
    if (entered !== expectedConfirmation) fail('Typed Production confirmation did not match. No records were changed.');

    const prepareOutput = dependencies.prepareOutput ?? preparePrivateRunOutput;
    output = await prepareOutput(parsed.credentialDirectory, repositoryRoot, parsed.runId);
    const provisioner = dependencies.provision ?? provisionPersistentDemo;
    let result: Awaited<ReturnType<typeof provisionPersistentDemo>>;
    try {
      result = await provisioner(target, parsed.runId, output);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      preserveRecoveryOutput = /(?:COMMIT outcome is uncertain|transaction and rollback outcome are uncertain|cleanup could not be verified; preserve the files)/i.test(message);
      throw error;
    }
    // At this point COMMIT returned successfully. If file finalization or output fails,
    // keep the manifest and one-time credentials so the operator can reconcile the run.
    preserveRecoveryOutput = true;
    await output.close();
    stdout(`Provisioned persistent Production demo run ${parsed.runId}: ${targetSummary(target)} ${manifestCounts(result.manifest)}.`);
    stdout(`Private one-time credentials: ${output.credentialsPath}`);
    stdout(`Sanitized recovery manifest: ${output.manifestPath}`);
    completed = true;
    return 0;
  } catch {
    // Driver and parser errors may contain secret connection details. The CLI deliberately
    // reports no arbitrary error message or stack trace.
    stderr('Production demo operation failed safely; inspect the private operator run state before retrying.');
    return 1;
  } finally {
    if (output) {
      if (!completed) {
        if (preserveRecoveryOutput) await output.close().catch(() => undefined);
        else await output.discard().catch(() => output!.close().catch(() => undefined));
      }
    }
    if (target) await target.client.end().catch(() => undefined);
  }
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entry && entry === import.meta.url) {
  process.exitCode = await runProductionDemoCli(process.argv.slice(2));
}
