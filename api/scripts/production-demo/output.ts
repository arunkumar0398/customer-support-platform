import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, realpath, readdir, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';

const RUN_ID_PATTERN = /^demo-[a-z0-9](?:[a-z0-9-]{6,58}[a-z0-9])?$/;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MASK = 0o077;
const WINDOWS_ALLOWED_SIDS = new Set(['S-1-5-18', 'S-1-5-32-544', 'SY', 'BA']);
const WINDOWS_FULL_CONTROL = new Set(['FA', '0x1f01ff', '0x1301bf']);

export interface PersistentDemoCredentialAccount {
  readonly label: 'admin' | 'agent' | 'customer-one' | 'customer-two';
  readonly email: string;
  readonly role: 'ADMIN' | 'AGENT' | 'CUSTOMER';
  readonly password: string;
}

export interface PersistentDemoCredentials {
  readonly runId: string;
  readonly accounts: readonly PersistentDemoCredentialAccount[];
}

export type SafeJsonValue = null | boolean | number | string | readonly SafeJsonValue[] | { readonly [key: string]: SafeJsonValue };

export interface PreparedPrivateRunOutput {
  readonly [preparedOutputBrand]: true;
  readonly runId: string;
  readonly directory: string;
  readonly credentialsPath: string;
  readonly manifestPath: string;
  writeCredentials(credentials: PersistentDemoCredentials): Promise<void>;
  writeManifest(manifest: SafeJsonValue): Promise<void>;
  discard(): Promise<void>;
  close(): Promise<void>;
}

const preparedOutputBrand: unique symbol = Symbol('prepared-production-demo-output');

interface OutputSecurityOptions {
  readonly platform?: NodeJS.Platform;
  readonly uid?: number;
  readonly windowsAclVerifier?: (path: string) => Promise<boolean>;
}

export function assertProductionDemoRunId(runId: unknown): asserts runId is string {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw new Error('Production demo run ID is invalid.');
  }
}

function pathComparison(value: string, platform: NodeJS.Platform): string {
  const normalized = resolve(value).replace(/[\\/]+$/, '');
  return platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

function isWithin(parent: string, child: string, platform: NodeJS.Platform): boolean {
  const pathFromParent = relative(parent, child);
  if (pathFromParent === '') return true;
  const normalized = platform === 'win32' ? pathFromParent.toLocaleLowerCase('en-US') : pathFromParent;
  return normalized !== '..' && !normalized.startsWith(`..${sep}`) && !isAbsolute(pathFromParent);
}

function assertNoSecretsInManifest(value: SafeJsonValue, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretsInManifest(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (/(?:password|passphrase|secret|token|cookie|hash|credential|connection.?string|database.?url)/i.test(key)) {
        throw new Error(`Manifest contains a prohibited field at ${path}.`);
      }
      assertNoSecretsInManifest(entry, `${path}.${key}`);
    }
  }
}

function assertCredentialBundle(credentials: PersistentDemoCredentials, runId: string): void {
  if (!credentials || credentials.runId !== runId || !Array.isArray(credentials.accounts) || credentials.accounts.length !== 4) {
    throw new Error('Credential bundle does not match the prepared run.');
  }
  if (Object.keys(credentials).sort().join(',') !== 'accounts,runId') {
    throw new Error('Credential bundle contains unsupported fields.');
  }
  const required = new Map<PersistentDemoCredentialAccount['label'], PersistentDemoCredentialAccount['role']>([
    ['admin', 'ADMIN'], ['agent', 'AGENT'], ['customer-one', 'CUSTOMER'], ['customer-two', 'CUSTOMER'],
  ]);
  const labels = new Set<string>();
  const emails = new Set<string>();
  for (const account of credentials.accounts) {
    if (!account || required.get(account.label) !== account.role
      || Object.keys(account).sort().join(',') !== 'email,label,password,role'
      || !account.email.endsWith('@example.test') || account.email !== account.email.toLowerCase()
      || typeof account.password !== 'string' || Buffer.byteLength(account.password, 'utf8') < 16
      || Buffer.byteLength(account.password, 'utf8') > 256
      || labels.has(account.label) || emails.has(account.email)) {
      throw new Error('Credential bundle is invalid.');
    }
    labels.add(account.label);
    emails.add(account.email);
  }
  if (labels.size !== required.size) throw new Error('Credential bundle is incomplete.');
}

function windowsSystemTool(name: string): string {
  const root = process.env.SystemRoot;
  if (!root || !isAbsolute(root)) throw new Error('Windows ACL verification is unavailable.');
  return resolve(root, 'System32', name);
}

async function verifyWindowsPrivateAcl(path: string): Promise<boolean> {
  const whoami = windowsSystemTool('whoami.exe');
  const icacls = windowsSystemTool('icacls.exe');
  let currentSid: string;
  try {
    const identity = execFileSync(whoami, ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', timeout: 3000 });
    const match = identity.match(/S-1-[0-9-]+/);
    if (!match) return false;
    currentSid = match[0].toUpperCase();
  } catch {
    return false;
  }

  const aclFile = join(tmpdir(), `production-demo-acl-${randomUUID()}.txt`);
  let aclText = '';
  try {
    execFileSync(icacls, [path, '/save', aclFile, '/c'], { stdio: 'ignore', timeout: 5000 });
    const aclBuffer = await (await import('node:fs/promises')).readFile(aclFile);
    aclText = (aclBuffer[1] === 0 ? aclBuffer.toString('utf16le') : aclBuffer.toString('utf8')).replace(/^\uFEFF/, '');
  } catch {
    return false;
  } finally {
    await unlink(aclFile).catch(() => undefined);
  }

  const daclLine = aclText.split(/\r?\n/).find((line) => /^D:(?:P|AI|AR|\()/.test(line));
  if (!daclLine) return false;
  const dacl = daclLine;
  const acePattern = /\(([^()]*)\)/g;
  let ace: RegExpExecArray | null;
  let ownerHasFullControl = false;
  let aceCount = 0;
  while ((ace = acePattern.exec(dacl)) !== null) {
    aceCount += 1;
    const fields = ace[1].split(';');
    if (fields.length !== 6) return false;
    const [kind, , rights, , , trustee] = fields;
    if (kind !== 'A') return false;
    const sid = trustee.toUpperCase();
    if (sid === currentSid) {
      if (!WINDOWS_FULL_CONTROL.has(rights.toUpperCase())) return false;
      ownerHasFullControl = true;
      continue;
    }
    if (!WINDOWS_ALLOWED_SIDS.has(sid) || !WINDOWS_FULL_CONTROL.has(rights.toUpperCase())) return false;
  }
  return aceCount > 0 && ownerHasFullControl;
}

async function assertPrivateDirectory(path: string, platform: NodeJS.Platform, uid: number | undefined,
  windowsAclVerifier: (path: string) => Promise<boolean>, requireEmpty = true): Promise<string> {
  if (!isAbsolute(path)) throw new Error('Credential destination must be an absolute path.');
  const inputPath = resolve(path);
  const pathInfo = await lstat(inputPath).catch(() => undefined);
  if (!pathInfo || !pathInfo.isDirectory() || pathInfo.isSymbolicLink()) {
    throw new Error('Credential destination must be an existing non-symlink directory.');
  }
  const canonicalPath = await realpath(inputPath);
  if (pathComparison(inputPath, platform) !== pathComparison(canonicalPath, platform)) {
    throw new Error('Credential destination must be a canonical directory.');
  }
  if (platform !== 'win32') {
    const currentUid = uid ?? process.getuid?.();
    const info = await stat(canonicalPath);
    if (currentUid === undefined || info.uid !== currentUid || (info.mode & PRIVATE_DIRECTORY_MASK) !== 0) {
      throw new Error('Credential destination must be owner-only and owned by the current operator.');
    }
  } else if (!await windowsAclVerifier(canonicalPath)) {
    throw new Error('Credential destination Windows ACL is not restricted to the operator, SYSTEM, and Administrators.');
  }
  if (requireEmpty) {
    const contents = await readdir(canonicalPath);
    if (contents.length !== 0) throw new Error('Credential destination must be empty.');
  }
  return canonicalPath;
}

async function verifyPrivateFile(handle: FileHandle, path: string, platform: NodeJS.Platform, uid: number | undefined,
  windowsAclVerifier: (path: string) => Promise<boolean>): Promise<void> {
  const opened = await handle.stat();
  const atPath = await lstat(path);
  if (!opened.isFile() || atPath.isSymbolicLink() || !atPath.isFile() || opened.nlink !== 1
    || opened.dev !== atPath.dev || opened.ino !== atPath.ino) {
    throw new Error('Private output file identity changed.');
  }
  if (platform !== 'win32') {
    const currentUid = uid ?? process.getuid?.();
    if (currentUid === undefined || opened.uid !== currentUid || (opened.mode & 0o777) !== PRIVATE_FILE_MODE) {
      throw new Error('Private output file permissions are not owner-only.');
    }
  } else if (!await windowsAclVerifier(path)) {
    throw new Error('Private output file Windows ACL is not restricted.');
  }
}

async function writeOnce(handle: FileHandle, path: string, payload: string, platform: NodeJS.Platform, uid: number | undefined,
  windowsAclVerifier: (path: string) => Promise<boolean>, state: { written: boolean }): Promise<void> {
  if (state.written) throw new Error('Private output file is already finalized.');
  await verifyPrivateFile(handle, path, platform, uid, windowsAclVerifier);
  await handle.writeFile(payload, { encoding: 'utf8' });
  await handle.sync();
  state.written = true;
  await verifyPrivateFile(handle, path, platform, uid, windowsAclVerifier);
}

export async function preparePrivateRunOutput(
  directory: string,
  repositoryRoot: string,
  runId: string,
  security: OutputSecurityOptions = {},
): Promise<PreparedPrivateRunOutput> {
  assertProductionDemoRunId(runId);
  const platform = security.platform ?? process.platform;
  const uid = security.uid;
  const windowsAclVerifier = security.windowsAclVerifier ?? verifyWindowsPrivateAcl;
  const canonicalRepository = await realpath(repositoryRoot).catch(() => undefined);
  if (!canonicalRepository) throw new Error('Repository root could not be canonicalized.');
  if (!isAbsolute(directory)) throw new Error('Credential destination must be an absolute path.');
  const lexicalDirectory = resolve(directory);
  if (isWithin(canonicalRepository, lexicalDirectory, platform)) {
    throw new Error('Credential destination must be outside the repository.');
  }
  const canonicalDirectory = await assertPrivateDirectory(directory, platform, uid, windowsAclVerifier);
  if (isWithin(canonicalRepository, canonicalDirectory, platform)) {
    throw new Error('Credential destination must be outside the repository.');
  }

  const credentialsPath = join(canonicalDirectory, `production-demo-credentials-${runId}.json`);
  const manifestPath = join(canonicalDirectory, `production-demo-manifest-${runId}.json`);
  const directoryIdentity = await stat(canonicalDirectory);
  let credentialsHandle: FileHandle | undefined;
  let manifestHandle: FileHandle | undefined;
  let createStage = 'credentials file';
  try {
    credentialsHandle = await open(credentialsPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, PRIVATE_FILE_MODE);
    await verifyPrivateFile(credentialsHandle, credentialsPath, platform, uid, windowsAclVerifier);
    createStage = 'manifest file';
    manifestHandle = await open(manifestPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, PRIVATE_FILE_MODE);
    await verifyPrivateFile(manifestHandle, manifestPath, platform, uid, windowsAclVerifier);
  } catch (error) {
    await credentialsHandle?.close().catch(() => undefined);
    await manifestHandle?.close().catch(() => undefined);
    if (manifestHandle) await unlink(manifestPath).catch(() => undefined);
    if (credentialsHandle) await unlink(credentialsPath).catch(() => undefined);
    if (error instanceof Error && /^(Private output file identity changed\.|Private output file permissions are not owner-only\.|Private output file Windows ACL is not restricted\.)$/.test(error.message)) {
      throw error;
    }
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code : 'UNKNOWN';
    const syscall = error && typeof error === 'object' && 'syscall' in error && typeof error.syscall === 'string'
      ? ` during ${error.syscall}` : '';
    throw new Error(`Private ${createStage} could not be created safely (${code}${syscall}).`);
  }

  let closed = false;
  let discarded = false;
  const credentialsWritten = { written: false };
  const manifestWritten = { written: false };
  return {
    [preparedOutputBrand]: true,
    runId,
    directory: canonicalDirectory,
    credentialsPath,
    manifestPath,
    async writeCredentials(credentials) {
      if (closed) throw new Error('Private output is closed.');
      assertCredentialBundle(credentials, runId);
      await writeOnce(credentialsHandle!, credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, platform, uid,
        windowsAclVerifier, credentialsWritten);
    },
    async writeManifest(manifest) {
      if (closed) throw new Error('Private output is closed.');
      assertNoSecretsInManifest(manifest);
      await writeOnce(manifestHandle!, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, platform, uid,
        windowsAclVerifier, manifestWritten);
    },
    async discard() {
      if (discarded) return;
      const directoryInfo = await lstat(canonicalDirectory).catch(() => undefined);
      const realDirectory = await realpath(canonicalDirectory).catch(() => undefined);
      if (!directoryInfo?.isDirectory() || directoryInfo.isSymbolicLink() || realDirectory !== canonicalDirectory) {
        throw new Error('Private output directory identity changed; files were preserved.');
      }
      const currentDirectory = await stat(canonicalDirectory);
      if (currentDirectory.dev !== directoryIdentity.dev || currentDirectory.ino !== directoryIdentity.ino) {
        throw new Error('Private output directory identity changed; files were preserved.');
      }
      if (platform !== 'win32') {
        const currentUid = uid ?? process.getuid?.();
        if (currentUid === undefined || currentDirectory.uid !== currentUid
          || (currentDirectory.mode & PRIVATE_DIRECTORY_MASK) !== 0) {
          throw new Error('Private output directory permissions changed; files were preserved.');
        }
      } else if (!await windowsAclVerifier(canonicalDirectory)) {
        throw new Error('Private output directory ACL changed; files were preserved.');
      }

      const removeOwnedFile = async (handle: FileHandle | undefined, path: string): Promise<void> => {
        if (!handle) return;
        const opened = await handle.stat();
        const current = await lstat(path).catch(() => undefined);
        if (!current) {
          await handle.close();
          return;
        }
        if (!opened.isFile() || !current.isFile() || current.isSymbolicLink()
          || opened.nlink !== 1 || current.dev !== opened.dev || current.ino !== opened.ino) {
          throw new Error('Private output file identity changed; files were preserved.');
        }
        if (platform !== 'win32') {
          const currentUid = uid ?? process.getuid?.();
          if (currentUid === undefined || opened.uid !== currentUid || (opened.mode & 0o777) !== PRIVATE_FILE_MODE) {
            throw new Error('Private output file permissions changed; files were preserved.');
          }
        } else if (!await windowsAclVerifier(path)) {
          throw new Error('Private output file ACL changed; files were preserved.');
        }
        await handle.close();
        await unlink(path);
      };
      await removeOwnedFile(credentialsHandle, credentialsPath);
      await removeOwnedFile(manifestHandle, manifestPath);
      closed = true;
      discarded = true;
    },
    async close() {
      if (closed) return;
      closed = true;
      await Promise.all([credentialsHandle!.close(), manifestHandle!.close()]);
    },
  };
}

/** Read only the exact sanitized manifest from an existing private run directory. */
export async function readPrivateRunManifest(
  directory: string,
  repositoryRoot: string,
  runId: string,
  security: OutputSecurityOptions = {},
): Promise<SafeJsonValue> {
  assertProductionDemoRunId(runId);
  const platform = security.platform ?? process.platform;
  const uid = security.uid;
  const windowsAclVerifier = security.windowsAclVerifier ?? verifyWindowsPrivateAcl;
  const canonicalRepository = await realpath(repositoryRoot).catch(() => undefined);
  if (!canonicalRepository) throw new Error('Repository root could not be canonicalized.');
  if (!isAbsolute(directory)) throw new Error('Credential destination must be an absolute path.');
  const lexicalDirectory = resolve(directory);
  if (isWithin(canonicalRepository, lexicalDirectory, platform)) {
    throw new Error('Credential destination must be outside the repository.');
  }
  const resolvedDirectory = await realpath(lexicalDirectory).catch(() => undefined);
  if (!resolvedDirectory) throw new Error('Credential destination must be an existing non-symlink directory.');
  if (pathComparison(lexicalDirectory, platform) !== pathComparison(resolvedDirectory, platform)) {
    throw new Error('Credential destination must be a canonical directory.');
  }
  if (isWithin(canonicalRepository, resolvedDirectory, platform)) {
    throw new Error('Credential destination must be outside the repository.');
  }
  const canonicalDirectory = await assertPrivateDirectory(directory, platform, uid, windowsAclVerifier, false);
  if (isWithin(canonicalRepository, canonicalDirectory, platform)) {
    throw new Error('Credential destination must be outside the repository.');
  }

  const manifestPath = join(canonicalDirectory, `production-demo-manifest-${runId}.json`);
  const before = await lstat(manifestPath).catch(() => undefined);
  if (!before?.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 262144) {
    throw new Error('Private run manifest file is missing or unsafe.');
  }
  const handle = await open(manifestPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => undefined);
  if (!handle) throw new Error('Private run manifest file could not be opened safely.');
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size || opened.size > 262144) {
      throw new Error('Private run manifest file identity changed.');
    }
    if (platform !== 'win32') {
      const currentUid = uid ?? process.getuid?.();
      if (currentUid === undefined || opened.uid !== currentUid || (opened.mode & 0o777) !== PRIVATE_FILE_MODE) {
        throw new Error('Private run manifest file permissions are not owner-only.');
      }
    } else if (!await windowsAclVerifier(manifestPath)) {
      throw new Error('Private run manifest file ACL is not restricted.');
    }

    const text = await handle.readFile({ encoding: 'utf8' });
    const after = await handle.stat();
    const atPath = await lstat(manifestPath).catch(() => undefined);
    const canonicalFile = await realpath(manifestPath).catch(() => undefined);
    if (!atPath?.isFile() || atPath.isSymbolicLink() || atPath.nlink !== 1
      || canonicalFile !== manifestPath || after.dev !== opened.dev || after.ino !== opened.ino
      || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
      || atPath.dev !== opened.dev || atPath.ino !== opened.ino || text.length > 262144) {
      throw new Error('Private run manifest file changed while it was read.');
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error('Private run manifest is invalid.');
    }
    assertNoSecretsInManifest(value as SafeJsonValue);
    return value as SafeJsonValue;
  } finally {
    await handle.close();
  }
}

export function assertPreparedPrivateRunOutput(value: unknown, expectedRunId: string): asserts value is PreparedPrivateRunOutput {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, preparedOutputBrand)) {
    throw new Error('Private output was not created by the output verifier.');
  }
  const output = value as PreparedPrivateRunOutput;
  if (output[preparedOutputBrand] !== true || output.runId !== expectedRunId) {
    throw new Error('Private output does not match the requested run.');
  }
}
