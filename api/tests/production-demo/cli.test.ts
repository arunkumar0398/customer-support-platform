import { describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parseProductionDemoArguments, runProductionDemoCli } from '../../scripts/production-demo/cli.js';

const profile = {
  projectId: 'silent-math-31251761',
  branchId: 'br-noisy-pond-a1yc6ozn',
  endpointId: 'ep-dark-cake-a1mpys0t',
  database: 'neondb',
  username: 'production_demo_provisioner',
};
const credentialDirectory = resolve(tmpdir(), 'production-demo-private-test');

const args = [
  '--mode', 'production',
  '--project-id', profile.projectId,
  '--branch-id', profile.branchId,
  '--endpoint-id', profile.endpointId,
  '--database', profile.database,
  '--username', profile.username,
  '--run-id', 'demo-evaluator-20261103-a1b2c3',
  '--credential-dir', credentialDirectory,
];

function dependencies(overrides: Record<string, unknown> = {}) {
  const calls = { verify: vi.fn(), output: vi.fn(), provision: vi.fn(), existing: vi.fn(), read: vi.fn(), prompt: vi.fn() };
  const target = { mode: 'production', identity: { mode: 'production', ...profile }, client: { end: vi.fn().mockResolvedValue(undefined) } };
  const output = { credentialsPath: 'C:\\private\\credentials.json', manifestPath: 'C:\\private\\manifest.json', discard: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
  const manifest = {
    runId: 'demo-evaluator-20261103-a1b2c3',
    target: { mode: 'production', ...profile },
    counts: { organizations: 1, users: 4, tickets: 2 },
  };
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    calls,
    target,
    output,
    manifest,
    stdout,
    stderr,
    deps: {
      env: {
        PRODUCTION_DEMO_DATABASE_URL: 'postgresql://never-print',
        NEON_API_KEY: 'never-print-key',
      },
      stdinIsTTY: true,
      stdoutIsTTY: true,
      repositoryRoot: 'C:\\repo',
      verifyTarget: calls.verify.mockResolvedValue(target),
      prepareOutput: calls.output.mockResolvedValue(output),
      provision: calls.provision.mockResolvedValue({ manifest, created: true }),
      verifyExisting: calls.existing.mockResolvedValue(manifest),
      readManifest: calls.read.mockResolvedValue(manifest),
      prompt: calls.prompt.mockResolvedValue(`${profile.projectId} demo-evaluator-20261103-a1b2c3`),
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
      ...overrides,
    },
  };
}

describe('Production demo CLI argument contract', () => {
  it('requires explicit production mode and the exact code-owned target identity', () => {
    expect(parseProductionDemoArguments(args)).toEqual({
      mode: 'production',
      action: 'provision',
      ...profile,
      runId: 'demo-evaluator-20261103-a1b2c3',
      credentialDirectory,
    });
    expect(() => parseProductionDemoArguments(args.slice(2))).toThrow(/mode/i);
    expect(() => parseProductionDemoArguments([...args, '--mode', 'preview'])).toThrow();
    expect(() => parseProductionDemoArguments(args.map((value) => value === profile.projectId ? 'other-project' : value))).toThrow(/code-owned Production target/);
    expect(() => parseProductionDemoArguments([...args, '--database-url', 'postgresql://secret'])).toThrow();
    expect(() => parseProductionDemoArguments([...args, '--run-id', 'second-run'])).toThrow();
    expect(() => parseProductionDemoArguments([...args, '--mode', 'production'])).toThrow();
  });

  it('accepts only the explicit verification-only action', () => {
    expect(parseProductionDemoArguments([...args, '--verify-existing']).action).toBe('verify-existing');
    expect(() => parseProductionDemoArguments([...args, '--verify-existing', '--action', 'provision'])).toThrow();
  });
});

describe('Production demo CLI execution', () => {
  it.each([
    ['stdin', { stdinIsTTY: false, stdoutIsTTY: true }],
    ['stdout', { stdinIsTTY: true, stdoutIsTTY: false }],
  ])('refuses provision when %s is not a TTY before target or output work', async (_stream, tty) => {
    const setup = dependencies(tty);
    const exitCode = await runProductionDemoCli(args, setup.deps as never);
    expect(exitCode).toBe(1);
    expect(setup.calls.verify).not.toHaveBeenCalled();
    expect(setup.calls.prompt).not.toHaveBeenCalled();
    expect(setup.calls.output).not.toHaveBeenCalled();
    expect(setup.calls.provision).not.toHaveBeenCalled();
  });

  it('refuses CI before target verification, prompting, output creation, or database activity', async () => {
    const setup = dependencies({ env: { CI: 'true', PRODUCTION_DEMO_DATABASE_URL: 'secret', NEON_API_KEY: 'secret' } });
    const exitCode = await runProductionDemoCli(args, setup.deps as never);
    expect(exitCode).toBe(1);
    expect(setup.calls.verify).not.toHaveBeenCalled();
    expect(setup.calls.prompt).not.toHaveBeenCalled();
    expect(setup.calls.output).not.toHaveBeenCalled();
    expect(setup.calls.provision).not.toHaveBeenCalled();
  });

  it('requires both private process environment values and does not print either value', async () => {
    for (const env of [
      { PRODUCTION_DEMO_DATABASE_URL: '', NEON_API_KEY: 'private-key' },
      { PRODUCTION_DEMO_DATABASE_URL: 'private-url', NEON_API_KEY: '' },
    ]) {
      const setup = dependencies({ env });
      const exitCode = await runProductionDemoCli(args, setup.deps as never);
      expect(exitCode).toBe(1);
      expect(setup.calls.verify).not.toHaveBeenCalled();
      const text = [...setup.stdout, ...setup.stderr].join('\n');
      expect(text).not.toContain('private-url');
      expect(text).not.toContain('private-key');
    }
  });

  it('requires the typed Production project and run confirmation before creating output', async () => {
    const setup = dependencies({ prompt: vi.fn().mockResolvedValue('wrong confirmation') });
    const exitCode = await runProductionDemoCli(args, setup.deps as never);
    expect(exitCode).toBe(1);
    expect(setup.calls.verify).toHaveBeenCalledOnce();
    expect(setup.deps.prompt).toHaveBeenCalledOnce();
    expect(setup.deps.prompt).toHaveBeenCalledWith(expect.stringContaining(`${profile.projectId} demo-evaluator-20261103-a1b2c3`));
    expect(setup.calls.output).not.toHaveBeenCalled();
    expect(setup.calls.provision).not.toHaveBeenCalled();
  });

  it('refuses a target that differs from the requested code-owned identity before prompting', async () => {
    const setup = dependencies({
      verifyTarget: vi.fn().mockResolvedValue({
        ...dependencies().target,
        identity: { mode: 'production', ...profile, branchId: 'br-other' },
      }),
    });
    const exitCode = await runProductionDemoCli(args, setup.deps as never);
    expect(exitCode).toBe(1);
    expect(setup.deps.prompt).not.toHaveBeenCalled();
    expect(setup.calls.output).not.toHaveBeenCalled();
  });

  it('provisions once after exact target verification and confirmation, with sanitized output', async () => {
    const setup = dependencies();
    const exitCode = await runProductionDemoCli(args, setup.deps as never);
    expect(exitCode).toBe(0);
    expect(setup.calls.verify).toHaveBeenCalledWith({
      databaseUrl: 'postgresql://never-print', neonApiKey: 'never-print-key',
    });
    expect(setup.calls.output).toHaveBeenCalledOnce();
    expect(setup.calls.provision).toHaveBeenCalledOnce();
    expect(setup.target.client.end).toHaveBeenCalledOnce();
    expect([...setup.stdout, ...setup.stderr].join('\n')).not.toContain('never-print');
    expect([...setup.stdout, ...setup.stderr].join('\n')).toContain('demo-evaluator-20261103-a1b2c3');
    expect([...setup.stdout, ...setup.stderr].join('\n')).toContain(profile.endpointId);
    expect([...setup.stdout, ...setup.stderr].join('\n')).toContain('credentials.json');
  });

  it('verification-only mode reuses the sanitized manifest without creating output or rotating passwords', async () => {
    const setup = dependencies({ stdinIsTTY: false, stdoutIsTTY: false });
    const exitCode = await runProductionDemoCli([...args, '--verify-existing'], setup.deps as never);
    expect(exitCode).toBe(0);
    expect(setup.calls.read).toHaveBeenCalledOnce();
    expect(setup.calls.existing).toHaveBeenCalledWith(setup.target, setup.manifest);
    expect(setup.calls.output).not.toHaveBeenCalled();
    expect(setup.calls.provision).not.toHaveBeenCalled();
    expect(setup.target.client.end).toHaveBeenCalledOnce();
  });

  it('removes only its private output after a confirmed pre-commit failure', async () => {
    const setup = dependencies({
      provision: vi.fn().mockRejectedValue(new Error('Run identity collision; no records were changed.')),
    });
    const exitCode = await runProductionDemoCli(args, setup.deps as never);
    expect(exitCode).toBe(1);
    expect(setup.output.discard).toHaveBeenCalledOnce();
    expect(setup.output.close).not.toHaveBeenCalled();
  });

  it('preserves private recovery files after an uncertain commit', async () => {
    const setup = dependencies({
      provision: vi.fn().mockRejectedValue(new Error('Provisioning COMMIT outcome is uncertain; preserve recovery files and reconcile read-only.')),
    });
    const exitCode = await runProductionDemoCli(args, setup.deps as never);
    expect(exitCode).toBe(1);
    expect(setup.output.discard).not.toHaveBeenCalled();
    expect(setup.output.close).toHaveBeenCalledOnce();
  });

  it('does not expose driver errors, credentials, or URLs on failure', async () => {
    const setup = dependencies({
      verifyTarget: vi.fn().mockRejectedValue(new Error('driver failed private-url private-neon-key')),
    });
    const exitCode = await runProductionDemoCli(args, setup.deps as never);
    expect(exitCode).toBe(1);
    const text = [...setup.stdout, ...setup.stderr].join('\n');
    expect(text).not.toContain('private-url');
    expect(text).not.toContain('private-neon-key');
    expect(text).not.toContain('driver failed');
  });
});
