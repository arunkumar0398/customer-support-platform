import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, createTicket } from '../../../lib/api';
import type { Identity } from '../../../lib/api';
import './ticket-create.css';

const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export function TicketCreatePage({ identity, organizationId }: { identity: Identity; organizationId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isStaff = ['ADMIN', 'AGENT'].includes(identity.memberships[0]?.role ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requesterUserId, setRequesterUserId] = useState('');
  const [priority, setPriority] = useState<(typeof priorities)[number]>('MEDIUM');
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState<'title' | 'description' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setInvalidField(null);

    if (!title.trim()) {
      setInvalidField('title');
      setError('Subject must contain at least one non-space character.');
      return;
    }
    if (!description.trim()) {
      setInvalidField('description');
      setError('Description must contain at least one non-space character.');
      return;
    }
    if (!organizationId) {
      setError('An active organization membership is required to create a ticket.');
      return;
    }

    setSubmitting(true);
    try {
      const ticket = await createTicket(organizationId, identity.csrfToken, {
        title: title.trim(),
        description: description.trim(),
        ...(isStaff ? { requesterUserId: requesterUserId.trim(), priority } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['tickets', identity.user.id, organizationId] });
      navigate(`/tickets/${ticket.id}`, { state: { createdTicket: ticket } });
    } catch (cause) {
      const message = cause instanceof ApiError
        ? cause.message
        : 'The service could not be reached. Check your connection and try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="ticket-create" aria-labelledby="ticket-create-title">
      <Link className="ticket-create-back" to="/">← Back to ticket queue</Link>
      <header className="ticket-create-heading">
        <p className="eyebrow">SUPPORT DESK · NEW REQUEST</p>
        <h1 id="ticket-create-title">Create a ticket</h1>
        <p>Tell us what happened. Your request will be added to the support queue.</p>
      </header>

      {!organizationId && (
        <p role="alert" className="ticket-create-error">An active organization membership is required to create a ticket.</p>
      )}

      <section className="ticket-create-card" aria-label="Ticket details">
        <form className="ticket-create-form" onSubmit={submit}>
          {isStaff && (
            <div className="ticket-create-field">
              <label htmlFor="ticket-requester">Customer membership ID</label>
              <input
                id="ticket-requester"
                autoComplete="off"
                inputMode="text"
                maxLength={36}
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                value={requesterUserId}
                onChange={(event) => setRequesterUserId(event.target.value)}
                required
                aria-describedby="requester-hint"
              />
              <small id="requester-hint">Enter the ID of an active customer in your organization.</small>
            </div>
          )}

          <div className="ticket-create-field">
            <label htmlFor="ticket-title">Subject</label>
            <input
              id="ticket-title"
              autoComplete="off"
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              aria-invalid={invalidField === 'title'}
              aria-describedby="ticket-title-hint"
            />
            <small id="ticket-title-hint">Use up to 200 characters.</small>
          </div>

          <div className="ticket-create-field">
            <label htmlFor="ticket-description">Description</label>
            <textarea
              id="ticket-description"
              maxLength={10000}
              rows={7}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              aria-invalid={invalidField === 'description'}
              aria-describedby="ticket-description-hint"
            />
            <small id="ticket-description-hint">Include the steps and details that will help us understand the issue. Up to 10,000 characters.</small>
          </div>

          {isStaff && (
            <div className="ticket-create-field ticket-create-priority">
              <label htmlFor="ticket-priority">Priority</label>
              <select id="ticket-priority" value={priority} onChange={(event) => setPriority(event.target.value as (typeof priorities)[number])}>
                {priorities.map((value) => (
                  <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="ticket-create-error" role="alert">{error}</p>}

          <div className="ticket-create-actions">
            <Link className="button button-quiet" to="/">Cancel</Link>
            <button className="button button-primary" type="submit" disabled={submitting || !organizationId}>
              {submitting ? 'Creating ticket…' : 'Submit ticket'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
