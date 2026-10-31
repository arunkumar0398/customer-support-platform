import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError, getDashboard } from '../../lib/api';
import type { DashboardMetrics, Identity, TicketListItem } from '../../lib/api';
import './dashboard.css';

const statuses: Array<{ value: TicketListItem['status']; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const priorities: Array<{ value: TicketListItem['priority']; label: string }> = [
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

function formatEvaluationTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function statusClass(status: TicketListItem['status']) {
  return `dashboard-status-${status.toLowerCase()}`;
}

export function DashboardPage({ identity, organizationId }: { identity: Identity; organizationId?: string }) {
  const membershipScope = identity.memberships
    .map((membership) => `${membership.organizationId}:${membership.role}`)
    .sort()
    .join('|');
  const dashboard = useQuery({
    queryKey: ['dashboard', identity.user.id, membershipScope, organizationId],
    queryFn: () => getDashboard(organizationId!),
    enabled: Boolean(organizationId),
    retry: false,
  });

  if (!organizationId) {
    return <main className="dashboard-state"><p role="alert">An active organization membership is required to view the dashboard.</p></main>;
  }

  if (dashboard.isPending) {
    return <main className="dashboard-state" role="status">Loading dashboard…</main>;
  }

  if (dashboard.isError || !dashboard.data) {
    const forbidden = dashboard.error instanceof ApiError && dashboard.error.status === 403;
    return (
      <main className="dashboard-state" aria-labelledby="dashboard-unavailable-title">
        <p className="eyebrow">SUPPORT DESK · TEAM OVERVIEW</p>
        <h1 id="dashboard-unavailable-title">{forbidden ? 'Dashboard unavailable' : 'Dashboard could not load'}</h1>
        <p role="alert">
          {forbidden
            ? 'You do not have access to the dashboard. Ask a team member if you need help with your request.'
            : dashboard.error instanceof ApiError
              ? dashboard.error.message
              : 'The service could not be reached. Check your connection and try again.'}
        </p>
        {!forbidden && <button className="button button-primary" onClick={() => void dashboard.refetch()}>Try again</button>}
        <Link className="button button-quiet" to="/">Return to ticket queue</Link>
      </main>
    );
  }

  return <DashboardOverview data={dashboard.data} refreshing={dashboard.isFetching} refresh={() => void dashboard.refetch()} />;
}

function DashboardOverview({ data, refreshing, refresh }: { data: DashboardMetrics; refreshing: boolean; refresh: () => void }) {
  const assignedActiveTickets = data.agentWorkloads.reduce((total, agent) => total + agent.activeCount, 0);

  return (
    <main className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">SUPPORT DESK · TEAM OVERVIEW</p>
          <h1 id="dashboard-title">Team dashboard</h1>
          <p>See what is waiting, what is moving, and where your team can help next.</p>
        </div>
        <button className="button button-quiet dashboard-refresh" type="button" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh dashboard'}
        </button>
      </header>

      <section className="dashboard-summary" aria-label="Support totals">
        <div className="dashboard-total">
          <span className="dashboard-total-label">All tickets</span>
          <strong>{data.totalTickets}</strong>
          <span className="dashboard-total-caption">in this organization</span>
        </div>
        <div className="dashboard-overdue" aria-label={`${data.overdueCount} overdue tickets`}>
          <span className="overdue-marker" aria-hidden="true">!</span>
          <div>
            <strong>{data.overdueCount} {data.overdueCount === 1 ? 'overdue ticket' : 'overdue tickets'}</strong>
            <p>Overdue means a due date before this snapshot while the ticket is still open or in progress.</p>
          </div>
        </div>
        <p className="dashboard-timestamp">
          Metrics as of <time dateTime={data.evaluationTime}>{formatEvaluationTime(data.evaluationTime)} UTC</time>
        </p>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel dashboard-status-panel" aria-labelledby="dashboard-status-title">
          <div className="dashboard-panel-heading">
            <div><p className="eyebrow">TICKET FLOW</p><h2 id="dashboard-status-title">Tickets by status</h2></div>
            <span className="dashboard-panel-total">{data.totalTickets} total</span>
          </div>
          <div className="dashboard-status-list">
            {statuses.map(({ value, label }) => {
              const count = data.statusCounts[value];
              const share = data.totalTickets === 0 ? 0 : Math.round((count / data.totalTickets) * 100);
              return (
                <div className="dashboard-status-row" key={value} data-testid={`status-count-${value}`}>
                  <div className="dashboard-status-copy">
                    <span className={`dashboard-status-dot ${statusClass(value)}`} aria-hidden="true" />
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="dashboard-status-track" aria-hidden="true"><span style={{ width: `${share}%` }} /></div>
                </div>
              );
            })}
          </div>
          {data.totalTickets === 0 && <p className="dashboard-empty-note" role="status">No tickets yet. <Link to="/tickets/new">Create the first ticket</Link>.</p>}
          <p className="dashboard-definition">Status totals include every ticket in this organization, including resolved and closed requests.</p>
        </section>

        <section className="dashboard-panel dashboard-priority-panel" aria-labelledby="dashboard-priority-title">
          <div className="dashboard-panel-heading">
            <div><p className="eyebrow">REQUEST URGENCY</p><h2 id="dashboard-priority-title">Tickets by priority</h2></div>
          </div>
          <dl className="dashboard-priority-list">
            {priorities.map(({ value, label }) => (
              <div key={value}>
                <dt><span className={`priority-label priority-${value.toLowerCase()}`}>{label}</span></dt>
                <dd data-testid={`priority-count-${value}`}>{data.priorityCounts[value]}</dd>
              </div>
            ))}
          </dl>
          <p className="dashboard-definition">Priority counts describe all tickets, regardless of their current status.</p>
        </section>

        <section className="dashboard-panel dashboard-workload-panel" aria-labelledby="dashboard-workload-title">
          <div className="dashboard-panel-heading">
            <div><p className="eyebrow">TEAM CAPACITY</p><h2 id="dashboard-workload-title">Agent workload</h2></div>
            <span className="dashboard-panel-total">{assignedActiveTickets} assigned active {assignedActiveTickets === 1 ? 'ticket' : 'tickets'}</span>
          </div>
          <p id="dashboard-workload-definition" className="dashboard-definition dashboard-workload-definition">
            Active workload includes assigned open and in-progress tickets only.
          </p>
          {data.agentWorkloads.length === 0 ? (
            <p className="dashboard-empty-note" role="status">No active agents are assigned to this organization.</p>
          ) : (
            <div className="dashboard-table-wrap" role="region" aria-label="Agent workload table" tabIndex={0} onKeyDown={(event) => {
              const delta = event.key === 'ArrowRight' ? 80 : event.key === 'ArrowLeft' ? -80 : 0;
              if (delta !== 0) {
                event.preventDefault();
                event.currentTarget.scrollBy({ left: delta, behavior: 'auto' });
              }
            }}>
              <table className="dashboard-workload-table" aria-describedby="dashboard-workload-definition">
                <thead><tr><th scope="col">Agent</th><th scope="col">Open</th><th scope="col">In progress</th><th scope="col">Active</th></tr></thead>
                <tbody>{data.agentWorkloads.map((agent) => (
                  <tr key={agent.userId}>
                    <th scope="row">{agent.email}</th>
                    <td>{agent.openCount} open</td>
                    <td>{agent.inProgressCount} in progress</td>
                    <td><strong>{agent.activeCount}</strong></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
