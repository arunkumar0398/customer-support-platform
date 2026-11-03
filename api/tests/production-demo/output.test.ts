import { execFileSync } from 'node:child_process';
import { access, chmod, link, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { preparePrivateRunOutput, readPrivateRunManifest } from '../../scripts/production-demo/output.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const createdDirectories: string[] = [];

async function privateDirectory(prefix = 'demo-output-test-'): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), prefix));
  createdDirectories.push(directory);
  if (process.platform === 'win32') {
    const whoami = execFileSync(resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'whoami.exe'),
      ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' });
    const ownerSid = whoami.match(/S-1-[0-9-]+/)?.[0];
    if (!ownerSid) throw new Error('Could not identify the test process SID.');
    execFileSync(resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe'), [
      directory, '/inheritance:r', '/grant:r',
      `*${ownerSid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F',
    ], { stdio: 'ignore' });
  } else {
    await chmod(directory, 0o700);
  }
  return directory;
}

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('private persistent-demo run output', () => {
  const runId = 'demo-20261103-a1b2c3d4';

  it.each([
    ['repository root', () => repositoryRoot],
    ['nested repository directory', () => resolve(repositoryRoot, 'api')],
    ['missing child whose name begins with two dots', () => resolve(repositoryRoot, '..private')],
    ['missing nested child whose name begins with two dots', () => resolve(repositoryRoot, 'api', '..private')],
  ])('rejects %s before creating any output', async (_label, directoryForTest) => {
    const directory = directoryForTest();
    await expect(preparePrivateRunOutput(directory, repositoryRoot, runId))
      .rejects.toThrow(/outside the repository/);
    await expect(access(resolve(directory, `production-demo-credentials-${runId}.json`)))
      .rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(resolve(directory, `production-demo-manifest-${runId}.json`)))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a symlink that resolves into the repository before creating files', async () => {
    const link = resolve(tmpdir(), `demo-output-link-${crypto.randomUUID()}`);
    await symlink(repositoryRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      await expect(preparePrivateRunOutput(link, repositoryRoot, runId))
        .rejects.toThrow(/outside the repository|canonical directory|non-symlink/);
      expect(await readdir(repositoryRoot)).not.toContain(`production-demo-credentials-${runId}.json`);
    } finally {
      await rm(link, { recursive: true, force: true });
    }
  });

  it('accepts an empty, private directory outside the repository and creates exclusive owner-only files', async () => {
    const directory = await privateDirectory();
    const output = await preparePrivateRunOutput(directory, repositoryRoot, runId);
    try {
      expect(output.credentialsPath).toBe(resolve(directory, basename(output.credentialsPath)));
      expect(output.manifestPath).toBe(resolve(directory, basename(output.manifestPath)));
      expect(await readdir(directory)).toEqual([
        basename(output.credentialsPath), basename(output.manifestPath),
      ].sort());
      const credentials = await stat(output.credentialsPath);
      const manifest = await stat(output.manifestPath);
      expect(credentials.isFile()).toBe(true);
      expect(manifest.isFile()).toBe(true);
      expect(credentials.nlink).toBe(1);
      expect(manifest.nlink).toBe(1);
      if (process.platform !== 'win32') {
        expect(credentials.mode & 0o777).toBe(0o600);
        expect(manifest.mode & 0o777).toBe(0o600);
        expect(credentials.uid).toBe(process.getuid?.());
      }
      expect(await readFile(output.credentialsPath, 'utf8')).toBe('');
      expect(await readFile(output.manifestPath, 'utf8')).toBe('');
    } finally {
      await output.close();
    }
  });

  it('writes only the run-bound synthetic credentials once and rejects credential-shaped manifest fields', async () => {
    const directory = await privateDirectory();
    const output = await preparePrivateRunOutput(directory, repositoryRoot, runId);
    const credentials = {
      runId,
      accounts: [
        { label: 'admin', role: 'ADMIN', email: `demo+${runId}.admin@example.test`, password: 'synthetic-test-password-01' },
        { label: 'agent', role: 'AGENT', email: `demo+${runId}.agent@example.test`, password: 'synthetic-test-password-02' },
        { label: 'customer-one', role: 'CUSTOMER', email: `demo+${runId}.customer-one@example.test`, password: 'synthetic-test-password-03' },
        { label: 'customer-two', role: 'CUSTOMER', email: `demo+${runId}.customer-two@example.test`, password: 'synthetic-test-password-04' },
      ],
    } as const;
    try {
      await output.writeCredentials(credentials);
      const written = await readFile(output.credentialsPath, 'utf8');
      expect(JSON.parse(written)).toEqual(credentials);
      await expect(output.writeCredentials(credentials)).rejects.toThrow(/already finalized/);
      expect(await readFile(output.credentialsPath, 'utf8')).toBe(written);
      await expect(output.writeManifest({ runId, databaseUrl: 'must-not-be-written' }))
        .rejects.toThrow(/prohibited field/);
      expect(await readFile(output.manifestPath, 'utf8')).toBe('');
    } finally {
      await output.close();
    }
  });

  it('rejects malformed credentials without writing any private file', async () => {
    const directory = await privateDirectory();
    const output = await preparePrivateRunOutput(directory, repositoryRoot, runId);
    try {
      await expect(output.writeCredentials({ runId, accounts: [] })).rejects.toThrow(/does not match/);
      expect(await readFile(output.credentialsPath, 'utf8')).toBe('');
      expect(await readFile(output.manifestPath, 'utf8')).toBe('');
    } finally {
      await output.close();
    }
  });

  it('rejects a non-empty destination and preserves its existing contents', async () => {
    const directory = await privateDirectory();
    const marker = resolve(directory, 'operator-note.txt');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(marker, 'keep'));
    await expect(preparePrivateRunOutput(directory, repositoryRoot, runId)).rejects.toThrow(/empty/);
    expect(await readFile(marker, 'utf8')).toBe('keep');
    expect(await readdir(directory)).toEqual(['operator-note.txt']);
  });

  it('refuses duplicate paths and never overwrites a pre-existing credential file', async () => {
    const directory = await privateDirectory();
    const existing = resolve(directory, `production-demo-credentials-${runId}.json`);
    await import('node:fs/promises').then(({ writeFile }) => writeFile(existing, 'operator-data'));
    await expect(preparePrivateRunOutput(directory, repositoryRoot, runId)).rejects.toThrow();
    expect(await readFile(existing, 'utf8')).toBe('operator-data');
  });

  it('rejects relative paths', async () => {
    await expect(preparePrivateRunOutput('.', repositoryRoot, runId)).rejects.toThrow(/absolute/);
  });

  it('rejects malformed run IDs before inspecting or creating destination files', async () => {
    const directory = await privateDirectory();
    await expect(preparePrivateRunOutput(directory, repositoryRoot, '../unsafe'))
      .rejects.toThrow(/run ID/);
    expect(await readdir(directory)).toEqual([]);
  });

  it('fails closed when the platform ACL verifier cannot prove Windows privacy', async () => {
    const directory = await privateDirectory();
    await expect(preparePrivateRunOutput(directory, repositoryRoot, runId, {
      platform: 'win32',
      windowsAclVerifier: async () => false,
    })).rejects.toThrow(/Windows ACL/);
    expect(await readdir(directory)).toEqual([]);
  });

  it('reads only a private run-named manifest without modifying the existing directory', async () => {
    const directory = await privateDirectory();
    const manifest = { version: 1, runId, target: { mode: 'production', projectId: 'safe-id' } };
    const path = resolve(directory, `production-demo-manifest-${runId}.json`);
    await writeFile(path, JSON.stringify(manifest), { mode: 0o600 });
    const value = await readPrivateRunManifest(directory, repositoryRoot, runId, {
      platform: process.platform,
      uid: process.getuid?.(),
      windowsAclVerifier: async () => true,
    });
    expect(value).toEqual(manifest);
    expect(await readdir(directory)).toEqual([basename(path)]);
  });

  it('rejects a manifest directory inside the repository and a multiply-linked manifest', async () => {
    await expect(readPrivateRunManifest(resolve(repositoryRoot, 'api'), repositoryRoot, runId))
      .rejects.toThrow(/outside the repository/);

    const directory = await privateDirectory();
    const target = resolve(directory, 'operator-data.json');
    const path = resolve(directory, `production-demo-manifest-${runId}.json`);
    await writeFile(target, '{"safe":true}', { mode: 0o600 });
    await link(target, path);
    await expect(readPrivateRunManifest(directory, repositoryRoot, runId, {
      platform: process.platform,
      uid: process.getuid?.(),
      windowsAclVerifier: async () => true,
    })).rejects.toThrow(/missing or unsafe/);
  });

  it('rejects secret-shaped manifest fields', async () => {
    const directory = await privateDirectory();
    const path = resolve(directory, `production-demo-manifest-${runId}.json`);
    await writeFile(path, JSON.stringify({ runId, databaseUrl: 'must-not-be-read' }), { mode: 0o600 });
    await expect(readPrivateRunManifest(directory, repositoryRoot, runId, {
      platform: process.platform,
      uid: process.getuid?.(),
      windowsAclVerifier: async () => true,
    })).rejects.toThrow(/prohibited field/);
  });
});
