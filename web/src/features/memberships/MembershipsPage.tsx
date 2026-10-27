import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { addMembership, ApiError, getMemberships, updateMembership } from '../../lib/api';
import type { Identity, MembershipRole, OrganizationMember } from '../../lib/api';
import './memberships.css';

const roles: Array<{ value: MembershipRole; label: string }> = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'AGENT', label: 'Agent' },
  { value: 'CUSTOMER', label: 'Customer' },
];

function roleLabel(role: MembershipRole) {
  return roles.find((item) => item.value === role)?.label ?? role;
}

function MembershipRow({
  member,
  busy,
  saveRole,
  toggleActive,
}: {
  member: OrganizationMember;
  busy: boolean;
  saveRole: (member: OrganizationMember, role: MembershipRole) => void;
  toggleActive: (member: OrganizationMember) => void;
}) {
  const [role, setRole] = useState(member.role);

  return (
    <tr>
      <th scope="row">{member.email}</th>
      <td><span className="member-role">{roleLabel(member.role)}</span></td>
      <td><span className={`member-status ${member.isActive ? 'member-status-active' : 'member-status-inactive'}`}>
        {member.isActive ? 'Active' : 'Inactive'}
      </span></td>
      <td>
        <label className="member-role-control">
          <span className="visually-hidden">Role for {member.email}</span>
          <select aria-label={`Role for ${member.email}`} value={role} disabled={busy} onChange={(event) => setRole(event.target.value as MembershipRole)}>
            {roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </td>
      <td className="member-actions">
        <button className="button button-quiet member-save" type="button" disabled={busy || role === member.role} onClick={() => saveRole(member, role)}>
          Save {member.email}
        </button>
        <button className="button button-quiet member-toggle" type="button" disabled={busy} onClick={() => toggleActive(member)}>
          {member.isActive ? `Deactivate ${member.email}` : `Reactivate ${member.email}`}
        </button>
      </td>
    </tr>
  );
}

export function MembershipsPage({
  identity,
  organizationId,
  refreshIdentity,
}: {
  identity: Identity;
  organizationId?: string;
  refreshIdentity: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const membershipScope = identity.memberships.map((membership) => `${membership.organizationId}:${membership.role}`).sort().join('|');
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<MembershipRole>('CUSTOMER');
  const [message, setMessage] = useState('');
  const roster = useQuery({
    queryKey: ['memberships', identity.user.id, membershipScope, organizationId, page],
    queryFn: () => getMemberships(organizationId!, page),
    enabled: Boolean(organizationId),
    retry: false,
  });

  async function refreshRoster() {
    if (!organizationId) return;
    await queryClient.invalidateQueries({ queryKey: ['memberships', identity.user.id, membershipScope, organizationId] });
  }

  const add = useMutation({
    mutationFn: () => addMembership(organizationId!, identity.csrfToken, { email, role: newRole }),
    onSuccess: async (member) => {
      setEmail('');
      setMessage(`${member.email} added to this organization.`);
      await refreshRoster();
    },
  });

  const update = useMutation({
    mutationFn: ({ member, role, isActive }: { member: OrganizationMember; role?: MembershipRole; isActive?: boolean }) =>
      updateMembership(organizationId!, identity.csrfToken, member.userId, { role, isActive }),
    onSuccess: async (member) => {
      setMessage(`${member.email} membership updated.`);
      await refreshRoster();
      if (member.userId === identity.user.id) await refreshIdentity();
    },
  });

  function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    add.mutate();
  }

  if (!organizationId) {
    return <main className="membership-state"><p role="alert">An active organization membership is required to manage members.</p></main>;
  }

  if (roster.isPending) return <main className="membership-state" role="status">Loading organization members…</main>;
  if (roster.isError || !roster.data) {
    const forbidden = roster.error instanceof ApiError && roster.error.status === 403;
    return (
      <main className="membership-state" aria-labelledby="membership-unavailable-title">
        <p className="eyebrow">SUPPORT DESK · ORGANIZATION SETTINGS</p>
        <h1 id="membership-unavailable-title">{forbidden ? 'Member management unavailable' : 'Members could not load'}</h1>
        <p role="alert">{forbidden ? 'This action is not permitted.' : roster.error instanceof ApiError ? roster.error.message : 'The service could not be reached.'}</p>
        {!forbidden && <button className="button button-primary" onClick={() => void roster.refetch()}>Try again</button>}
        <Link className="button button-quiet" to="/">Return to ticket queue</Link>
      </main>
    );
  }

  const busy = add.isPending || update.isPending;
  const error = add.error ?? update.error;
  const lastPage = Math.max(1, Math.ceil(roster.data.total / roster.data.pageSize));

  return (
    <main className="members-page" aria-labelledby="members-title">
      <header className="members-heading">
        <div>
          <p className="eyebrow">SUPPORT DESK · ORGANIZATION SETTINGS</p>
          <h1 id="members-title">Organization members</h1>
          <p>Manage access for this organization. Changes apply to its membership only.</p>
        </div>
        <p className="members-total"><strong>{roster.data.total}</strong> {roster.data.total === 1 ? 'member' : 'members'}</p>
      </header>

      <section className="members-add-panel" aria-labelledby="members-add-title">
        <div><p className="eyebrow">EXISTING ACCOUNTS</p><h2 id="members-add-title">Add a member</h2></div>
        <form className="members-add-form" onSubmit={submitAdd}>
          <label htmlFor="member-email">Existing account email
            <input id="member-email" type="email" maxLength={320} required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label htmlFor="member-role">New member role
            <select id="member-role" value={newRole} onChange={(event) => setNewRole(event.target.value as MembershipRole)}>
              {roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <button className="button button-primary" type="submit" disabled={busy}>Add member</button>
        </form>
      </section>

      {(error || message) && <p className={error ? 'membership-feedback membership-error' : 'membership-feedback membership-success'} role={error ? 'alert' : 'status'}>
        {error instanceof ApiError ? error.message : error instanceof Error ? error.message : message}
      </p>}

      <section className="members-panel" aria-labelledby="members-roster-title">
        <div className="members-panel-heading"><div><p className="eyebrow">ACCESS ROSTER</p><h2 id="members-roster-title">Members and roles</h2></div></div>
        <div className="members-table-wrap">
          <table className="members-table">
            <thead><tr><th scope="col">Account</th><th scope="col">Current role</th><th scope="col">Access</th><th scope="col">Change role</th><th scope="col">Actions</th></tr></thead>
            <tbody>{roster.data.items.map((member) => (
              <MembershipRow
                key={member.userId}
                member={member}
                busy={busy}
                saveRole={(current, role) => { setMessage(''); update.mutate({ member: current, role }); }}
                toggleActive={(current) => { setMessage(''); update.mutate({ member: current, isActive: !current.isActive }); }}
              />
            ))}</tbody>
          </table>
        </div>
        {roster.data.items.length === 0 && <p className="members-empty" role="status">No members are on this page yet.</p>}
        <div className="members-pagination">
          <span>Page {roster.data.page} of {lastPage}</span>
          <div>
            <button className="button button-quiet" type="button" disabled={page <= 1 || busy} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <button className="button button-quiet" type="button" disabled={page >= lastPage || busy} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>
      </section>
      <p className="members-policy-note">At least one active administrator must remain in this organization.</p>
    </main>
  );
}
