import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, lstat, mkdir, open, realpath, rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const execFileAsync = promisify(execFile);

export type PrivateRunFiles = {
  directoryPath: string;
  credentialsPath: string;
  manifestPath: string;
};

function outsideRepository(candidate: string, repositoryRoot: string): boolean {
  const relativePath = relative(repositoryRoot, candidate);
  return relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
}

function assertNoSensitiveManifestKeys(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (/password|hash|secret|token|cookie|connection.?string|database.?url/i.test(key)) {
      throw new Error('Sanitized manifest contains a prohibited credential field.');
    }
    assertNoSensitiveManifestKeys(nested);
  }
}

async function setWindowsPrivateAcl(path: string, directory: boolean): Promise<void> {
  const { stdout: accountOutput } = await execFileAsync('whoami', [], { windowsHide: true });
  const account = accountOutput.trim().split(/\r?\n/).at(-1)?.trim();
  if (!account || account.includes('\n')) throw new Error('Could not verify the current Windows operator identity.');
  const permissions = directory ? '(OI)(CI)F' : 'F';
  await execFileAsync('icacls', [path, '/inheritance:r', '/grant:r', `${account}:${permissions}`], { windowsHide: true });
  const { stdout } = await execFileAsync('icacls', [path], { windowsHide: true });
  const accessEntries = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => /\S:\(/.test(line));
  const expectedEntry = `${account}:(`;
  if (accessEntries.length !== 1 || !accessEntries[0].toLowerCase().includes(expectedEntry.toLowerCase())
    || !accessEntries[0].includes('(F)')) {
    throw new Error('Windows credential destination ACL is not restricted to the current operator.');
  }
}

export async function assertPrivateFileAccess(path: string): Promise<void> {
  const info = await stat(path);
  if (process.platform === 'win32') {
    await setWindowsPrivateAcl(path, info.isDirectory());
    return;
  }
  const forbiddenMask = info.isDirectory() ? 0o077 : 0o077;
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if ((info.mode & forbiddenMask) !== 0 || (uid !== undefined && info.uid !== uid)) {
    throw new Error('Credential destination permissions allow access outside the operator account.');
  }
}

async function createPrivateDirectory(outputDirectory: string, repositoryRoot: string): Promise<string> {
  if (!isAbsolute(outputDirectory)) throw new Error('Output directory must be an absolute path.');
  const repository = await realpath(resolve(repositoryRoot));
  const output = resolve(outputDirectory);
  const parent = await realpath(dirname(output));
  const canonicalOutput = resolve(parent, output.slice(output.lastIndexOf(sep) + 1));
  if (!outsideRepository(canonicalOutput, repository)) {
    throw new Error('Credential output directory must be outside the repository.');
  }
  try {
    await lstat(canonicalOutput);
    throw new Error('Credential output directory must be new and empty; existing paths are refused.');
  } catch (error) {
    if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error;
  }
  await mkdir(canonicalOutput, { recursive: false, mode: 0o700 });
  try {
    if (process.platform === 'win32') await setWindowsPrivateAcl(canonicalOutput, true);
    else await chmod(canonicalOutput, 0o700);
    await assertPrivateFileAccess(canonicalOutput);
    return canonicalOutput;
  } catch (error) {
    await rmdir(canonicalOutput).catch(() => undefined);
    throw error;
  }
}

async function writePrivateFile(path: string, contents: string): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(contents, { encoding: 'utf8' });
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (process.platform === 'win32') await setWindowsPrivateAcl(path, false);
  else await chmod(path, 0o600);
  await assertPrivateFileAccess(path);
}

export async function createPrivateRunFiles(
  outputDirectory: string,
  repositoryRoot: string,
  runId: string,
  credentials: unknown,
  manifest: unknown,
): Promise<PrivateRunFiles> {
  if (!/^prod-demo-\d{8}-[a-f0-9]{8}$/.test(runId)) throw new Error('Production run ID format is invalid.');
  assertNoSensitiveManifestKeys(manifest);
  const directoryPath = await createPrivateDirectory(outputDirectory, repositoryRoot);
  const files: PrivateRunFiles = {
    directoryPath,
    credentialsPath: resolve(directoryPath, `production-demo-credentials-${runId}.json`),
    manifestPath: resolve(directoryPath, `production-demo-manifest-${runId}.json`),
  };
  try {
    await writePrivateFile(files.credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`);
    await writePrivateFile(files.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return files;
  } catch (error) {
    await discardPrivateRunFiles(files);
    throw error;
  }
}

export async function discardPrivateRunFiles(files: PrivateRunFiles): Promise<void> {
  await unlink(files.credentialsPath).catch((error: unknown) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  });
  await unlink(files.manifestPath).catch((error: unknown) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  });
  await rmdir(files.directoryPath).catch((error: unknown) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  });
}
