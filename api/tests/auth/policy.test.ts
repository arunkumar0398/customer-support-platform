import { describe, expect, it } from 'vitest';
import {
  assertCanComment, assertCanEditTicketContent, assertCanManageTicket, assertTicketVisible,
  requireAdmin, requireStaff, ticketScope,
} from '../../src/lib/policy.js';
import type { TicketPolicyTarget } from '../../src/lib/policy.js';
import type { ActiveMembershipContext } from '../../src/middleware/active-membership.js';

const admin: ActiveMembershipContext = { organizationId: 'org-alpha', userId: 'staff-alpha', role: 'ADMIN' };
const agent: ActiveMembershipContext = { organizationId: 'org-alpha', userId: 'staff-alpha', role: 'AGENT' };
const customer: ActiveMembershipContext = { organizationId: 'org-alpha', userId: 'customer-one', role: 'CUSTOMER' };
const ownTicket: TicketPolicyTarget = { organizationId: 'org-alpha', requesterUserId: 'customer-one', status: 'OPEN' };
const otherCustomerTicket: TicketPolicyTarget = { ...ownTicket, requesterUserId: 'customer-two' };
const foreignTicket: TicketPolicyTarget = { ...ownTicket, organizationId: 'org-beta' };

function observedError(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  return undefined;
}

describe('central staff/admin capabilities', () => {
  it.each([
    { context: admin, adminAllowed: true, staffAllowed: true },
    { context: agent, adminAllowed: false, staffAllowed: true },
    { context: customer, adminAllowed: false, staffAllowed: false },
  ])('enforces membership administration and staff actions for $context.role', ({ context, adminAllowed, staffAllowed }) => {
    if (adminAllowed) expect(() => requireAdmin(context)).not.toThrow();
    else expect(observedError(() => requireAdmin(context))).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    if (staffAllowed) expect(() => requireStaff(context)).not.toThrow();
    else expect(observedError(() => requireStaff(context))).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});

describe('non-disclosing ticket visibility', () => {
  it.each([admin, agent, customer])('allows visible tickets for $role regardless of closed status', (context) => {
    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const) {
      expect(() => assertTicketVisible(context, { ...ownTicket, status })).not.toThrow();
    }
  });

  it.each([admin, agent, customer])('hides a foreign-org or absent ticket from $role', (context) => {
    for (const ticket of [foreignTicket, null]) {
      expect(observedError(() => assertTicketVisible(context, ticket))).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    }
  });

  it('hides another customer ticket within the same organization', () => {
    expect(observedError(() => assertTicketVisible(customer, otherCustomerTicket)))
      .toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it.each([admin, agent])('allows $role to see another requester in its organization', (context) => {
    expect(() => assertTicketVisible(context, otherCustomerTicket)).not.toThrow();
  });
});

describe('ticket action rules', () => {
  it.each(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const)('limits customer content edits in state %s', (status) => {
    const action = () => assertCanEditTicketContent(customer, { ...ownTicket, status });
    if (status === 'OPEN') expect(action).not.toThrow();
    else expect(observedError(action)).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it.each([admin, agent])('allows $role content edits without granting status-transition authority', (context) => {
    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const) {
      expect(() => assertCanEditTicketContent(context, { ...otherCustomerTicket, status })).not.toThrow();
    }
  });

  it.each([admin, agent, customer])('allows comments for $role only while the visible ticket is non-closed', (context) => {
    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const) {
      expect(() => assertCanComment(context, { ...ownTicket, status })).not.toThrow();
    }
    expect(observedError(() => assertCanComment(context, { ...ownTicket, status: 'CLOSED' })))
      .toMatchObject({ status: 409, code: 'TICKET_CLOSED' });
  });

  it.each([admin, agent])('allows $role to manage visible status/priority/assignment', (context) => {
    expect(() => assertCanManageTicket(context, otherCustomerTicket)).not.toThrow();
  });

  it('denies staff-only ticket actions to the owning customer', () => {
    expect(observedError(() => assertCanManageTicket(customer, ownTicket)))
      .toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it.each([
    { context: admin, ticket: foreignTicket },
    { context: agent, ticket: foreignTicket },
    { context: customer, ticket: foreignTicket },
    { context: customer, ticket: otherCustomerTicket },
  ])('denies every object action before revealing state outside visibility: $context.role/$ticket.organizationId/$ticket.requesterUserId', ({ context, ticket }) => {
    for (const operation of [assertCanEditTicketContent, assertCanComment, assertCanManageTicket]) {
      expect(observedError(() => operation(context, { ...ticket, status: 'CLOSED' })))
        .toMatchObject({ status: 404, code: 'NOT_FOUND' });
    }
  });
});

describe('mandatory ticket query scope', () => {
  it.each([
    { ...customer, organizationId: undefined },
    { ...customer, userId: undefined },
  ])('refuses incomplete server context rather than emitting an unscoped query: %j', (context) => {
    expect(observedError(() => ticketScope(context as unknown as ActiveMembershipContext)))
      .toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('fails closed for an unrecognized role instead of treating it as staff', () => {
    const invalid = { ...customer, role: 'UNRECOGNIZED' } as unknown as ActiveMembershipContext;
    expect(observedError(() => ticketScope(invalid))).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it.each([admin, agent])('retains organization scope for $role when criteria target a foreign organization', (context) => {
    expect(ticketScope(context, { organizationId: 'org-beta', id: 'foreign-ticket' })).toEqual({
      AND: [{ organizationId: 'org-alpha' }, { organizationId: 'org-beta', id: 'foreign-ticket' }],
    });
  });

  it('retains customer ownership when criteria target another requester', () => {
    expect(ticketScope(customer, { requesterUserId: 'customer-two' })).toEqual({
      AND: [
        { organizationId: 'org-alpha', requesterUserId: 'customer-one' },
        { requesterUserId: 'customer-two' },
      ],
    });
  });

  it('applies customer ownership even without additional criteria', () => {
    expect(ticketScope(customer)).toEqual({
      AND: [{ organizationId: 'org-alpha', requesterUserId: 'customer-one' }, {}],
    });
  });
});
