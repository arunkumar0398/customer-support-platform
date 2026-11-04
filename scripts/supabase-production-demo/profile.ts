export const productionTarget = Object.freeze({
  provider: 'supabase' as const,
  projectRef: 'ityzntsmumvtktjjdacs',
  region: 'ap-northeast-2',
  branchLabel: 'main / PRODUCTION',
  hostname: 'db.ityzntsmumvtktjjdacs.supabase.co',
  port: 5432,
  database: 'postgres',
  username: 'csp_prod_runtime',
});

export const localTestTarget = Object.freeze({
  provider: 'local-test' as const,
  hostname: 'localhost',
  database: 'support_test',
  username: 'support_test',
});

export const applicationTables = Object.freeze([
  'Organization', 'User', 'Membership', 'Ticket', 'Comment', 'ActivityEvent', 'Session',
] as const);

export const applicationTypes = Object.freeze([
  'MembershipRole', 'TicketStatus', 'TicketPriority', 'ActivityEventType',
] as const);

export type ProductionTarget = typeof productionTarget & { tls: 'verified' };
export type LocalTestTarget = typeof localTestTarget & { tls: 'local' };
export type VerifiedTarget = ProductionTarget | LocalTestTarget;
