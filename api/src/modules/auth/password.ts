import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const MAXMEM = 128 * 1024 * 1024;
const HASH_PATTERN = /^\$scrypt\$32768\$8\$1\$([0-9a-f]{32})\$([0-9a-f]{64})$/;
const DUMMY_HASH = `$scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(64)}`;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAXMEM },
      (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 16 || Buffer.byteLength(password, 'utf8') > 256) {
    throw new TypeError('Password must be 16 to 256 UTF-8 bytes.');
  }
  const salt = randomBytes(16);
  const digest = await derive(password, salt);
  return `$scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${digest.toString('hex')}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof passwordHash !== 'string') return false;
  const parts = HASH_PATTERN.exec(passwordHash);
  const [, saltHex, digestHex] = parts ?? HASH_PATTERN.exec(DUMMY_HASH)!;
  const derived = await derive(password, Buffer.from(saltHex, 'hex'));
  const matches = timingSafeEqual(derived, Buffer.from(digestHex, 'hex'));
  return Boolean(parts) && matches;
}
