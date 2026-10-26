import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { requireAdmin } from '../../lib/policy.js';
import { ApiError } from '../../middleware/errors.js';
import type { CreateMembershipInput, RosterQuery, UpdateMembershipInput } from './schema.js';

const membershipSelect = {
  organizationId: true, userId: true, role: true, isActive: true,
  user: { select: { email: true } },
} as const satisfies Prisma.MembershipSelect;
type SelectedMembership = Prisma.MembershipGetPayload<{ select: typeof membershipSelect }>;

function publicMembership(member: SelectedMembership) {
  return {
    organizationId: member.organizationId, userId: member.userId, email: member.user.email,
    role: member.role, isActive: member.isActive,
  };
}

async function currentAdministrator(transaction: Prisma.TransactionClient, actor: ActiveMembershipContext) {
  const current = await transaction.membership.findFirst({
    where: { organizationId: actor.organizationId, userId: actor.userId, isActive: true },
    select: { organizationId: true, userId: true, role: true },
  });
  if (!current) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
  requireAdmin(current);
  return current;
}

async function withAdminWrite<T>(
  client: PrismaClient,
  actor: ActiveMembershipContext,
  operation: (transaction: Prisma.TransactionClient, current: ActiveMembershipContext) => Promise<T>,
): Promise<T> {
  requireAdmin(actor);
  return client.$transaction(async (transaction) => {
    // Every membership write takes the same tenant row lock. Re-check the actor
    // after waiting so a concurrent role removal cannot authorize a stale write.
    const organizations = await transaction.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Organization" WHERE "id" = ${actor.organizationId}::uuid FOR UPDATE
    `;
    if (organizations.length !== 1) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const current = await currentAdministrator(transaction, actor);
    return operation(transaction, current);
  }, { maxWait: 5000, timeout: 10000 });
}

export async function listMemberships(client: PrismaClient, actor: ActiveMembershipContext, query: RosterQuery) {
  requireAdmin(actor);
  return client.$transaction(async (transaction) => {
    const current = await currentAdministrator(transaction, actor);
    const where = { organizationId: current.organizationId };
    const total = await transaction.membership.count({ where });
    const memberships = await transaction.membership.findMany({
      where, select: membershipSelect,
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    });
    return { items: memberships.map(publicMembership), total, page: query.page, pageSize: query.pageSize };
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
}

export async function createMembership(client: PrismaClient, actor: ActiveMembershipContext, input: CreateMembershipInput) {
  return withAdminWrite(client, actor, async (transaction, current) => {
    // Existing-account membership only: this path never creates users or changes credentials.
    const user = await transaction.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const existing = await transaction.membership.findUnique({
      where: { organizationId_userId: { organizationId: current.organizationId, userId: user.id } },
      select: { userId: true },
    });
    if (existing) throw new ApiError(409, 'MEMBERSHIP_EXISTS', 'Membership already exists.');
    const member = await transaction.membership.create({
      data: { organizationId: current.organizationId, userId: user.id, role: input.role, isActive: true },
      select: membershipSelect,
    });
    return publicMembership(member);
  });
}

export async function updateMembership(
  client: PrismaClient, actor: ActiveMembershipContext, userId: string, input: UpdateMembershipInput,
) {
  return withAdminWrite(client, actor, async (transaction, current) => {
    const where = { organizationId_userId: { organizationId: current.organizationId, userId } };
    const member = await transaction.membership.findUnique({ where, select: { role: true, isActive: true } });
    if (!member) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const nextRole = input.role ?? member.role;
    const nextActive = input.isActive ?? member.isActive;
    if (member.role === 'ADMIN' && member.isActive && (nextRole !== 'ADMIN' || !nextActive)) {
      const activeAdmins = await transaction.membership.count({
        where: { organizationId: current.organizationId, role: 'ADMIN', isActive: true },
      });
      if (activeAdmins <= 1) throw new ApiError(409, 'LAST_ADMIN_REQUIRED', 'An active administrator must remain.');
    }
    const updated = await transaction.membership.update({
      where, data: { role: input.role, isActive: input.isActive }, select: membershipSelect,
    });
    return publicMembership(updated);
  });
}
