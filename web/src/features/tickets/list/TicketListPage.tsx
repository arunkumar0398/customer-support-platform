import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, getTickets } from '../../../lib/api';
import type { Identity, TicketListItem } from '../../../lib/api';
import './ticket-list.css';

const PAGE_SIZE = 25;
const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

function titleCase(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function TicketRow({ ticket }: { ticket: TicketListItem }) {
  return (
    <tr>
      <td className="ticket-number">#{ticket.ticketNumber}</td>
      <th scope="row" className="ticket-title-cell">
        <Link className="ticket-row-link" to={`/tickets/${ticket.id}`}>{ticket.title}</Link>
        <small>Updated {new Date(ticket.updatedAt).toLocaleDateString()}</small>
      </th>
      <td><span className={`status-pill status-${ticket.status.toLowerCase()}`}>{titleCase(ticket.status)}</span></td>
      <td><span className={`priority-label priority-${ticket.priority.toLowerCase()}`}>{titleCase(ticket.priority)}</span></td>
      <td className="assignee-cell">{ticket.assigneeUserId ? 'Assigned' : 'Unassigned'}</td>
    </tr>
  );
}

export function TicketListPage({ identity, organizationId }: { identity: Identity; organizationId?: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const latestSearchParams = useRef(new URLSearchParams(searchParams));
  const pendingSearchParams = useRef<string | null>(null);
  const [searchValue, setSearchValue] = useState(searchParams.get('search') ?? '');
  const [customerIdValue, setCustomerIdValue] = useState(searchParams.get('customerId') ?? '');
  const [assigneeIdValue, setAssigneeIdValue] = useState(searchParams.get('assigneeId') ?? '');
  const status = searchParams.get('status') ?? '';
  const priority = searchParams.get('priority') ?? '';
  const assigneeId = searchParams.get('assigneeId') ?? '';
  const membershipScope = identity.memberships
    .map((membership) => `${membership.organizationId}:${membership.role}`)
    .sort()
    .join('|');
  const parsedPage = Number(searchParams.get('page') ?? 1);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const isStaff = ['ADMIN', 'AGENT'].includes(identity.memberships[0]?.role ?? '');

  useEffect(() => {
    setSearchValue(searchParams.get('search') ?? '');
    setCustomerIdValue(searchParams.get('customerId') ?? '');
    setAssigneeIdValue(searchParams.get('assigneeId') ?? '');
  }, [searchParams]);

  useLayoutEffect(() => {
    const renderedParams = searchParams.toString();
    if (pendingSearchParams.current === renderedParams) pendingSearchParams.current = null;
    if (pendingSearchParams.current === null) {
      latestSearchParams.current = new URLSearchParams(searchParams);
    }
  }, [searchParams]);

  function updateSearchParams(next: URLSearchParams) {
    latestSearchParams.current = new URLSearchParams(next);
    const nextValue = next.toString();
    pendingSearchParams.current = nextValue === searchParams.toString() ? null : nextValue;
    setSearchParams(next);
  }

  const queryString = useMemo(() => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (priority) query.set('priority', priority);
    if (isStaff && assigneeId) query.set('assigneeId', assigneeId);
    const customerId = searchParams.get('customerId')?.trim();
    if (isStaff && customerId) query.set('customerId', customerId);
    const search = searchParams.get('search')?.trim();
    if (search) query.set('search', search);
    query.set('page', String(page));
    query.set('pageSize', String(PAGE_SIZE));
    return query.toString();
  }, [assigneeId, isStaff, page, priority, searchParams, status]);

  const tickets = useQuery({
    queryKey: ['tickets', identity.user.id, organizationId, membershipScope, queryString],
    queryFn: () => getTickets(organizationId!, queryString),
    enabled: Boolean(organizationId),
    retry: false,
  });

  function updateFilter(key: 'status' | 'priority', value: string) {
    const next = new URLSearchParams(latestSearchParams.current);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    updateSearchParams(next);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams(latestSearchParams.current);
    const search = searchValue.trim();
    if (search) next.set('search', search);
    else next.delete('search');
    if (isStaff) {
      const customerId = customerIdValue.trim();
      if (customerId) next.set('customerId', customerId);
      else next.delete('customerId');
      const assigneeId = assigneeIdValue.trim();
      if (assigneeId) next.set('assigneeId', assigneeId);
      else next.delete('assigneeId');
    }
    next.delete('page');
    updateSearchParams(next);
  }

  function changePage(value: number) {
    const next = new URLSearchParams(latestSearchParams.current);
    if (value <= 1) next.delete('page');
    else next.set('page', String(value));
    updateSearchParams(next);
  }

  const pageCount = Math.max(1, Math.ceil((tickets.data?.total ?? 0) / PAGE_SIZE));
  const errorMessage = tickets.error instanceof ApiError
    ? tickets.error.message
    : 'The service could not be reached. Check your connection and try again.';

  return (
    <section className="ticket-queue" aria-labelledby="ticket-queue-title">
      <div className="queue-heading">
        <div>
          <p className="eyebrow">{identity.memberships[0]?.organization.slug ?? 'WORKSPACE'}</p>
          <h1 id="ticket-queue-title">Ticket queue</h1>
          <p className="queue-intro">A clear view of every conversation that needs your team.</p>
        </div>
        <Link className="button button-primary" to="/tickets/new">Create ticket</Link>
        {tickets.data && (
          <p className="queue-total" aria-live="polite">
            <strong>{tickets.data.total}</strong> {tickets.data.total === 1 ? 'ticket' : 'tickets'}
          </p>
        )}
      </div>

      <div className="queue-card">
        <div className="queue-toolbar">
          <form className="ticket-search" onSubmit={submitSearch} role="search">
            <div className="search-field">
              <label htmlFor="ticket-search">
                Search tickets
                <input
                  id="ticket-search"
                  type="search"
                  maxLength={100}
                  placeholder="Search subject or details"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                />
              </label>
              {isStaff && (
                <label htmlFor="customer-filter">
                  Customer ID
                  <input
                    id="customer-filter"
                    type="text"
                    maxLength={36}
                    placeholder="Paste customer UUID"
                    value={customerIdValue}
                    onChange={(event) => setCustomerIdValue(event.target.value)}
                  />
                </label>
              )}
              {isStaff && (
                <label htmlFor="assignee-filter">
                  Assignee ID
                  <input
                    id="assignee-filter"
                    type="text"
                    maxLength={36}
                    placeholder="Agent UUID or unassigned"
                    value={assigneeIdValue}
                    onChange={(event) => setAssigneeIdValue(event.target.value)}
                  />
                </label>
              )}
              <button className="button button-primary" type="submit">Search</button>
            </div>
          </form>
          <div className="queue-filters">
            <label>
              Status
              <select value={status} onChange={(event) => updateFilter('status', event.target.value)}>
                <option value="">All statuses</option>
                {statuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
              </select>
            </label>
            <label>
              Priority
              <select value={priority} onChange={(event) => updateFilter('priority', event.target.value)}>
                <option value="">All priorities</option>
                {priorities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
              </select>
            </label>
          </div>
        </div>

        {!organizationId && <p role="alert" className="queue-message">An active organization membership is required to view tickets.</p>}
        {organizationId && tickets.isPending && <p className="queue-message" role="status">Loading tickets…</p>}
        {organizationId && tickets.isError && (
          <div className="queue-message queue-error" role="alert">
            <p>We could not load tickets. {errorMessage}</p>
            <button className="button button-quiet" onClick={() => void tickets.refetch()}>Try again</button>
          </div>
        )}
        {tickets.data && tickets.data.items.length === 0 && (
          <div className="queue-empty" role="status">
            <span className="empty-mark" aria-hidden="true">—</span>
            <h2>No tickets match these filters</h2>
            <p>Clear a filter or try a different search to see more conversations.</p>
          </div>
        )}
        {tickets.data && tickets.data.items.length > 0 && (
          <>
            <div className="ticket-table-wrap">
              <table className="ticket-table">
                <thead>
                  <tr><th scope="col">Ticket</th><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Priority</th><th scope="col">Owner</th></tr>
                </thead>
                <tbody>{tickets.data.items.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)}</tbody>
              </table>
            </div>
            <nav className="queue-pagination" aria-label="Ticket pagination">
              <span>Page {tickets.data.page} of {pageCount}</span>
              <div>
                <button className="button button-quiet" disabled={tickets.data.page <= 1} onClick={() => changePage(tickets.data!.page - 1)}>Previous page</button>
                <button className="button button-quiet" disabled={tickets.data.page >= pageCount} onClick={() => changePage(tickets.data!.page + 1)}>Next page</button>
              </div>
            </nav>
          </>
        )}
      </div>
    </section>
  );
}
