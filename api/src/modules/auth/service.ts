import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { ApiError } from '../../middleware/errors.js';
import { hashToken, SESSION_DURATION_MS } from './session.js';
import { verifyPassword } from './password.js';

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
  const valid = await verifyPassword(password, user?.passwordHash ?? '');
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
