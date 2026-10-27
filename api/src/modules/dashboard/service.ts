import type { PrismaClient } from '../../generated/prisma/client.js';
import { requireStaff } from '../../lib/policy.js';
import type { ActiveMembershipContext } from '../../middleware/active-membership.js';
import { ApiError } from '../../middleware/errors.js';

const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
type TicketStatus = typeof statuses[number];
type TicketPriority = typeof priorities[number];

export async function getDashboard(
  client: PrismaClient,
  actor: ActiveMembershipContext,
  now: () => Date = () => new Date(),
) {
  requireStaff(actor);
  const evaluationTime = now();

  return client.$transaction(async (transaction) => {
    const membership = await transaction.membership.findFirst({
      where: { organizationId: actor.organizationId, userId: actor.userId, isActive: true },
      select: { organizationId: true, userId: true, role: true },
    });
    if (!membership) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
    const currentActor = { ...actor, ...membership };
    requireStaff(currentActor);
    const organizationId = membership.organizationId;

    const statusRows = await transaction.ticket.groupBy({
      by: ['status'], where: { organizationId }, _count: { _all: true },
    });
    const priorityRows = await transaction.ticket.groupBy({
      by: ['priority'], where: { organizationId }, _count: { _all: true },
    });
    const activeAgents = await transaction.membership.findMany({
      where: { organizationId, isActive: true, role: 'AGENT' },
      select: { userId: true, user: { select: { email: true } } },
      orderBy: { userId: 'asc' },
    });
    const agentIds = activeAgents.map((agent) => agent.userId);
    const workloadRows = agentIds.length === 0 ? [] : await transaction.ticket.groupBy({
      by: ['assigneeUserId', 'status'],
      where: { organizationId, assigneeUserId: { in: agentIds }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      _count: { _all: true },
    });
    const overdueCount = await transaction.ticket.count({
      where: {
        organizationId,
        dueAt: { lt: evaluationTime },
        status: { notIn: ['RESOLVED', 'CLOSED'] },
      },
    });

    const statusCounts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<TicketStatus, number>;
    const priorityCounts = Object.fromEntries(priorities.map((priority) => [priority, 0])) as Record<TicketPriority, number>;
    for (const row of statusRows) statusCounts[row.status] = row._count._all;
    for (const row of priorityRows) priorityCounts[row.priority] = row._count._all;

    const workloadByAgent = new Map<string, { openCount: number; inProgressCount: number }>();
    for (const row of workloadRows) {
      if (!row.assigneeUserId) continue;
      const workload = workloadByAgent.get(row.assigneeUserId) ?? { openCount: 0, inProgressCount: 0 };
      if (row.status === 'OPEN') workload.openCount = row._count._all;
      if (row.status === 'IN_PROGRESS') workload.inProgressCount = row._count._all;
      workloadByAgent.set(row.assigneeUserId, workload);
    }

    const agentWorkloads = activeAgents.map((agent) => {
      const workload = workloadByAgent.get(agent.userId) ?? { openCount: 0, inProgressCount: 0 };
      return {
        userId: agent.userId,
        email: agent.user.email,
        ...workload,
        activeCount: workload.openCount + workload.inProgressCount,
      };
    });

    return {
      evaluationTime,
      totalTickets: Object.values(statusCounts).reduce((total, count) => total + count, 0),
      statusCounts,
      priorityCounts,
      overdueCount,
      agentWorkloads,
    };
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
}
