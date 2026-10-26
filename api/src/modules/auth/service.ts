import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { ApiError } from '../../middleware/errors.js';
import { hashToken, SESSION_DURATION_MS } from './session.js';

const dummyHash = `$scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(64)}`;

async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  // Fixed parameters prevent a corrupted hash from controlling memory/CPU cost.
  const parts = /^\$scrypt\$32768\$8\$1\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(passwordHash);
  const [, salt, digest] = parts ?? /^\$scrypt\$32768\$8\$1\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(dummyHash)!;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, 'hex'), 32,
      { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
  return timingSafeEqual(derived, Buffer.from(digest, 'hex')) && parts !== null;
}

export async function currentIdentity(client: PrismaClient, userId: string) {
  const identity = await client.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true,
      memberships: {
        where: { isActive: true },
        orderBy: { organizationId: 'asc' },
        select: { organizationId: true, role: true, organization: { select: { name: true, slug: true } } },
      },
    },
  });
  if (!identity) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return { user: { id: identity.id, email: identity.email }, memberships: identity.memberships };
}

export async function passwordLogin(
  client: PrismaClient,
  email: string,
  password: string,
  now: Date,
  previousToken?: string,
) {
  const user = await client.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  // Unknown accounts still perform the same expensive password derivation.
  const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);
  if (!user || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

  const token = randomBytes(32).toString('hex');
  await client.$transaction(async (transaction) => {
    if (previousToken) {
      await transaction.session.updateMany({
        where: { tokenHash: hashToken(previousToken), revokedAt: null }, data: { revokedAt: now },
      });
    }
    await transaction.session.create({ data: {
      userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
    } });
  });
  return { token, identity: await currentIdentity(client, user.id) };
}
