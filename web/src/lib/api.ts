export interface OrganizationMembership {
  organizationId: string;
  role: 'ADMIN' | 'AGENT' | 'CUSTOMER';
  organization: { name: string; slug: string };
}

export interface Identity {
  user: { id: string; email: string };
  memberships: OrganizationMembership[];
  csrfToken: string;
}

export interface TicketListItem {
  id: string;
  organizationId: string;
  ticketNumber: number;
  requesterUserId: string;
  assigneeUserId: string | null;
  title: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListResponse {
  items: TicketListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreatedTicket extends TicketListItem {
  description: string;
}

export type TicketDetail = CreatedTicket;

export interface TicketComment {
  id: string;
  organizationId: string;
  ticketId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}

export interface TicketActivityEvent {
  id: string;
  organizationId: string;
  ticketId: string;
  actorUserId: string;
  type: 'TICKET_CREATED' | 'TITLE_CHANGED' | 'DESCRIPTION_CHANGED' | 'STATUS_CHANGED'
    | 'PRIORITY_CHANGED' | 'ASSIGNMENT_CHANGED' | 'COMMENT_ADDED';
  previousValue: unknown;
  newValue: unknown;
  reason: string | null;
  createdAt: string;
}

export interface TicketPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardMetrics {
  evaluationTime: string;
  totalTickets: number;
  statusCounts: Record<TicketListItem['status'], number>;
  priorityCounts: Record<TicketListItem['priority'], number>;
  overdueCount: number;
  agentWorkloads: Array<{
    userId: string;
    email: string;
    openCount: number;
    inProgressCount: number;
    activeCount: number;
  }>;
}

export type MembershipRole = 'ADMIN' | 'AGENT' | 'CUSTOMER';

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  email: string;
  role: MembershipRole;
  isActive: boolean;
}

export interface MembershipRoster {
  items: OrganizationMember[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateTicketPayload {
  title?: string;
  description?: string;
  status?: TicketListItem['status'];
  priority?: TicketListItem['priority'];
}

export interface CreateTicketPayload {
  title: string;
  description: string;
  requesterUserId?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: 'include', headers });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The service could not be reached. Check your connection and try again.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ErrorEnvelope;
    const code = typeof body.error?.code === 'string' ? body.error.code : 'REQUEST_FAILED';
    const message = typeof body.error?.message === 'string'
      ? body.error.message
      : 'The request could not be completed. Try again.';
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function getCurrentIdentity(): Promise<Identity> {
  return request<Identity>('/api/auth/me');
}

export function signIn(email: string, password: string): Promise<Identity> {
  return request<Identity>('/api/auth/login', {
    method: 'POST',
    headers: { 'X-CSRF-Protection': '1' },
    body: JSON.stringify({ email, password }),
  });
}

export function signOut(csrfToken: string): Promise<void> {
  return request<void>('/api/auth/logout', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}

export function getTickets(organizationId: string, query: string): Promise<TicketListResponse> {
  return request<TicketListResponse>(`/api/tickets?${query}`, {
    headers: { 'X-Organization-ID': organizationId },
  });
}

export function createTicket(
  organizationId: string,
  csrfToken: string,
  payload: CreateTicketPayload,
): Promise<CreatedTicket> {
  return request<CreatedTicket>('/api/tickets', {
    method: 'POST',
    headers: {
      'X-Organization-ID': organizationId,
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(payload),
  });
}

export function getTicketDetail(organizationId: string, ticketId: string): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${encodeURIComponent(ticketId)}`, {
    headers: { 'X-Organization-ID': organizationId },
  });
}

export function updateTicket(
  organizationId: string,
  csrfToken: string,
  ticket: TicketDetail,
  payload: UpdateTicketPayload,
): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${encodeURIComponent(ticket.id)}`, {
    method: 'PATCH',
    headers: {
      'X-Organization-ID': organizationId,
      'X-CSRF-Token': csrfToken,
      'X-Ticket-Version': String(ticket.version),
    },
    body: JSON.stringify(payload),
  });
}

export function assignTicket(
  organizationId: string,
  csrfToken: string,
  ticket: TicketDetail,
  assigneeUserId: string | null,
): Promise<TicketDetail> {
  return request<TicketDetail>(`/api/tickets/${encodeURIComponent(ticket.id)}/assignment`, {
    method: 'PATCH',
    headers: {
      'X-Organization-ID': organizationId,
      'X-CSRF-Token': csrfToken,
      'X-Ticket-Version': String(ticket.version),
    },
    body: JSON.stringify({ assigneeUserId }),
  });
}

export function getTicketComments(organizationId: string, ticketId: string): Promise<TicketPage<TicketComment>> {
  return request<TicketPage<TicketComment>>(`/api/tickets/${encodeURIComponent(ticketId)}/comments`, {
    headers: { 'X-Organization-ID': organizationId },
  });
}

export function createTicketComment(
  organizationId: string,
  csrfToken: string,
  ticketId: string,
  body: string,
): Promise<TicketComment> {
  return request<TicketComment>(`/api/tickets/${encodeURIComponent(ticketId)}/comments`, {
    method: 'POST',
    headers: { 'X-Organization-ID': organizationId, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ body }),
  });
}

export function getTicketActivity(organizationId: string, ticketId: string): Promise<TicketPage<TicketActivityEvent>> {
  return request<TicketPage<TicketActivityEvent>>(`/api/tickets/${encodeURIComponent(ticketId)}/activity`, {
    headers: { 'X-Organization-ID': organizationId },
  });
}

export function getDashboard(organizationId: string): Promise<DashboardMetrics> {
  return request<DashboardMetrics>('/api/dashboard', {
    headers: { 'X-Organization-ID': organizationId },
  });
}

export function getMemberships(organizationId: string, page: number): Promise<MembershipRoster> {
  const query = new URLSearchParams({ page: String(page), pageSize: '25' });
  return request<MembershipRoster>(`/api/memberships?${query}`, {
    headers: { 'X-Organization-ID': organizationId },
  });
}

export function addMembership(
  organizationId: string,
  csrfToken: string,
  payload: { email: string; role: MembershipRole },
): Promise<OrganizationMember> {
  return request<OrganizationMember>('/api/memberships', {
    method: 'POST',
    headers: { 'X-Organization-ID': organizationId, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(payload),
  });
}

export function updateMembership(
  organizationId: string,
  csrfToken: string,
  userId: string,
  payload: { role?: MembershipRole; isActive?: boolean },
): Promise<OrganizationMember> {
  return request<OrganizationMember>(`/api/memberships/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'X-Organization-ID': organizationId, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(payload),
  });
}
