import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError, assignTicket, createTicketComment, getTicketActivity, getTicketComments, getTicketDetail, updateTicket } from '../../../lib/api';
import type { CreatedTicket, Identity, TicketActivityEvent, TicketListItem } from '../../../lib/api';
import './ticket-detail.css';

const statuses: TicketListItem['status'][] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const priorities: TicketListItem['priority'][] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function titleCase(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eventLabel(event: TicketActivityEvent) {
  const labels: Record<TicketActivityEvent['type'], string> = {
    TICKET_CREATED: 'Ticket created',
    TITLE_CHANGED: 'Title changed',
    DESCRIPTION_CHANGED: 'Description changed',
    STATUS_CHANGED: 'Status changed',
    PRIORITY_CHANGED: 'Priority changed',
    ASSIGNMENT_CHANGED: 'Assignment changed',
    COMMENT_ADDED: 'Comment added',
  };
  return labels[event.type];
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return 'The service could not be reached. Check your connection and try again.';
}

export function TicketDetailPage({
  identity,
  organizationId,
  ticketId,
  createdTicket,
}: {
  identity: Identity;
  organizationId?: string;
  ticketId: string;
  createdTicket?: CreatedTicket;
}) {
  const queryClient = useQueryClient();
  const membership = identity.memberships[0];
  const isStaff = membership?.role === 'ADMIN' || membership?.role === 'AGENT';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TicketListItem['status']>('OPEN');
  const [priority, setPriority] = useState<TicketListItem['priority']>('MEDIUM');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  const ticketQuery = useQuery({
    queryKey: ['ticket-detail', identity.user.id, organizationId, ticketId],
    queryFn: () => getTicketDetail(organizationId!, ticketId),
    enabled: Boolean(organizationId),
    retry: false,
  });
  const commentsQuery = useQuery({
    queryKey: ['ticket-comments', identity.user.id, organizationId, ticketId],
    queryFn: () => getTicketComments(organizationId!, ticketId),
    enabled: Boolean(organizationId && ticketQuery.data),
    retry: false,
  });
  const activityQuery = useQuery({
    queryKey: ['ticket-activity', identity.user.id, organizationId, ticketId],
    queryFn: () => getTicketActivity(organizationId!, ticketId),
    enabled: Boolean(organizationId && ticketQuery.data),
    retry: false,
  });

  useEffect(() => {
    if (!ticketQuery.data) return;
    setTitle(ticketQuery.data.title);
    setDescription(ticketQuery.data.description);
    setStatus(ticketQuery.data.status);
    setPriority(ticketQuery.data.priority);
    setAssigneeUserId(ticketQuery.data.assigneeUserId ?? '');
  }, [ticketQuery.data]);

  async function refreshAfterMutation() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ticket-detail', identity.user.id, organizationId, ticketId] }),
      queryClient.invalidateQueries({ queryKey: ['ticket-comments', identity.user.id, organizationId, ticketId] }),
      queryClient.invalidateQueries({ queryKey: ['ticket-activity', identity.user.id, organizationId, ticketId] }),
      queryClient.invalidateQueries({ queryKey: ['tickets', identity.user.id, organizationId] }),
    ]);
  }

  async function refreshTicket() {
    setError('');
    setConflict(false);
    setNotice('');
    await ticketQuery.refetch();
  }

  async function saveTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !ticketQuery.data) return;
    setError('');
    setNotice('');
    setConflict(false);
    setSaving(true);
    try {
      const payload = isStaff
        ? { title: title.trim(), description: description.trim(), status, priority }
        : { title: title.trim(), description: description.trim() };
      await updateTicket(organizationId, identity.csrfToken, ticketQuery.data, payload);
      setNotice('Ticket updated.');
      await refreshAfterMutation();
    } catch (cause) {
      setError(getErrorMessage(cause));
      setConflict(cause instanceof ApiError && cause.status === 409 && cause.code === 'VERSION_CONFLICT');
      if (cause instanceof ApiError && cause.code === 'INVALID_STATUS_TRANSITION') setStatus(ticketQuery.data.status);
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !ticketQuery.data) return;
    setError('');
    setNotice('');
    setConflict(false);
    setSaving(true);
    try {
      await assignTicket(organizationId, identity.csrfToken, ticketQuery.data, assigneeUserId.trim() || null);
      setNotice('Assignment updated.');
      await refreshAfterMutation();
    } catch (cause) {
      setError(getErrorMessage(cause));
      setConflict(cause instanceof ApiError && cause.status === 409 && cause.code === 'VERSION_CONFLICT');
    } finally {
      setSaving(false);
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !ticketQuery.data) return;
    setError('');
    setNotice('');
    setSendingComment(true);
    try {
      await createTicketComment(organizationId, identity.csrfToken, ticketId, comment.trim());
      setComment('');
      setNotice('Reply added.');
      await refreshAfterMutation();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setSendingComment(false);
    }
  }

  if (!organizationId) {
    return <main className="ticket-detail-state"><p role="alert">An active organization membership is required to view tickets.</p><Link to="/">Return to ticket queue</Link></main>;
  }

  if (ticketQuery.isPending) return <main className="ticket-detail-state" role="status">Loading ticket…</main>;
  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <main className="ticket-detail-state">
        <p className="eyebrow">SUPPORT DESK · TICKET</p>
        <h1>Ticket unavailable</h1>
        <p role="alert">{ticketQuery.error ? getErrorMessage(ticketQuery.error) : 'The ticket could not be loaded.'}</p>
        <Link className="button button-primary" to="/">Return to ticket queue</Link>
      </main>
    );
  }

  const ticket = ticketQuery.data;
  const canEdit = isStaff || (membership?.role === 'CUSTOMER' && ticket.status === 'OPEN');
  const canComment = ticket.status !== 'CLOSED';
  const hasCreatedReceipt = createdTicket?.id === ticket.id;

  return (
    <main className="ticket-detail" aria-labelledby="ticket-detail-title">
      <Link className="ticket-detail-back" to="/">← Back to ticket queue</Link>
      {hasCreatedReceipt ? (
        <header className="ticket-detail-heading">
          <p className="eyebrow">SUPPORT DESK · RECEIVED</p>
          <h1 id="ticket-detail-title">Ticket submitted</h1>
          <p className="ticket-detail-number">Ticket #{ticket.ticketNumber}</p>
          <p className="ticket-detail-receipt" role="status">Your request is in the support queue.</p>
          <h2 className="ticket-created-title">{ticket.title}</h2>
          <div className="ticket-detail-meta">
            <span className={`status-pill status-${ticket.status.toLowerCase()}`}>{titleCase(ticket.status)}</span>
            <span className={`priority-label priority-${ticket.priority.toLowerCase()}`}>{titleCase(ticket.priority)} priority</span>
          </div>
        </header>
      ) : (
        <header className="ticket-detail-heading">
          <p className="eyebrow">SUPPORT DESK · TICKET #{ticket.ticketNumber}</p>
          <h1 id="ticket-detail-title">{ticket.title}</h1>
          <div className="ticket-detail-meta">
            <span className={`status-pill status-${ticket.status.toLowerCase()}`}>{titleCase(ticket.status)}</span>
            <span className={`priority-label priority-${ticket.priority.toLowerCase()}`}>{titleCase(ticket.priority)} priority</span>
            <span>Updated {new Date(ticket.updatedAt).toLocaleString()}</span>
          </div>
        </header>
      )}

      {error && (
        <div className="ticket-detail-error" role="alert">
          <span>{error}</span>
          {conflict && <button className="button button-quiet" type="button" onClick={() => void refreshTicket()}>Refresh ticket</button>}
        </div>
      )}
      {notice && <p className="ticket-detail-notice" role="status">{notice}</p>}

      <div className="ticket-detail-grid">
        <section className="ticket-detail-card ticket-edit-card" aria-labelledby="ticket-edit-heading">
          <h2 id="ticket-edit-heading">Ticket details</h2>
          {canEdit ? (
            <form className="ticket-detail-form" onSubmit={(event) => void saveTicket(event)}>
              <label htmlFor="ticket-subject">Subject</label>
              <input id="ticket-subject" value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} />
              <label htmlFor="ticket-description">Description</label>
              <textarea id="ticket-description" value={description} maxLength={10000} rows={7} required onChange={(event) => setDescription(event.target.value)} />
              {isStaff && <>
                <label htmlFor="ticket-status">Ticket status</label>
                <select id="ticket-status" value={status} onChange={(event) => setStatus(event.target.value as TicketListItem['status'])}>
                  {statuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
                </select>
                <label htmlFor="ticket-priority-detail">Priority</label>
                <select id="ticket-priority-detail" value={priority} onChange={(event) => setPriority(event.target.value as TicketListItem['priority'])}>
                  {priorities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
                </select>
              </>}
              <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </form>
          ) : (
            <div className="ticket-detail-readonly">
              <p><strong>Subject</strong><span>{ticket.title}</span></p>
              <p><strong>Description</strong><span>{ticket.description}</span></p>
              <p>This ticket can no longer be edited in its current state.</p>
            </div>
          )}
        </section>

        <section className="ticket-detail-card ticket-history-card" aria-labelledby="ticket-history-heading">
          <h2 id="ticket-history-heading">Activity history</h2>
          {activityQuery.isPending && <p role="status">Loading activity…</p>}
          {activityQuery.isError && <p role="alert">We could not load activity history. <button className="text-button" onClick={() => void activityQuery.refetch()}>Try again</button></p>}
          {activityQuery.data?.items.length === 0 && <p>No activity has been recorded yet.</p>}
          {activityQuery.data && activityQuery.data.items.length > 0 && (
            <ol className="ticket-activity-list">
              {activityQuery.data.items.map((event) => (
                <li key={event.id}>
                  <span className="activity-mark" aria-hidden="true" />
                  <div><strong>{eventLabel(event)}</strong><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
                    {event.reason && <p>{event.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {isStaff && (
          <section className="ticket-detail-card ticket-assignment-card" aria-labelledby="ticket-assignment-heading">
            <h2 id="ticket-assignment-heading">Ownership</h2>
            <p>{ticket.assigneeUserId ? `Assigned to ${ticket.assigneeUserId}` : 'This ticket is unassigned.'}</p>
            <form className="ticket-detail-form" onSubmit={(event) => void saveAssignment(event)}>
              <label htmlFor="ticket-assignee">Assign to agent ID</label>
              <input id="ticket-assignee" value={assigneeUserId} maxLength={36} placeholder="Agent membership UUID; blank to unassign" onChange={(event) => setAssigneeUserId(event.target.value)} />
              <small>Enter an active agent membership in this organization. Leave blank to unassign.</small>
              <button className="button button-quiet" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save assignment'}</button>
            </form>
          </section>
        )}

        <section className="ticket-detail-card ticket-conversation-card" aria-labelledby="ticket-conversation-heading">
          <h2 id="ticket-conversation-heading">Conversation</h2>
          {commentsQuery.isPending && <p role="status">Loading conversation…</p>}
          {commentsQuery.isError && <p role="alert">We could not load replies. <button className="text-button" onClick={() => void commentsQuery.refetch()}>Try again</button></p>}
          {commentsQuery.data?.items.length === 0 && <p>No replies yet. Add the first update below.</p>}
          {commentsQuery.data && commentsQuery.data.items.length > 0 && (
            <ol className="ticket-comments-list">
              {commentsQuery.data.items.map((item) => (
                <li key={item.id}><p>{item.body}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></li>
              ))}
            </ol>
          )}
          {canComment ? (
            <form className="ticket-detail-form ticket-comment-form" onSubmit={(event) => void addComment(event)}>
              <label htmlFor="ticket-reply">Add a reply</label>
              <textarea id="ticket-reply" value={comment} maxLength={10000} rows={4} required onChange={(event) => setComment(event.target.value)} />
              <button className="button button-primary" type="submit" disabled={sendingComment || !comment.trim()}>{sendingComment ? 'Sending…' : 'Send reply'}</button>
            </form>
          ) : <p>Replies are closed for this ticket.</p>}
        </section>
      </div>
      <Link className="ticket-detail-queue-link" to="/">Return to ticket queue</Link>
    </main>
  );
}
