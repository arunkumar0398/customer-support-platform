import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { Client } from 'pg';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';
import { cleanupFixtures, provisionFixtures, removeFixtureFiles } from '../../../scripts/preview/fixtures.js';
import { connectVerifiedTarget, type VerifiedTarget } from '../../../scripts/preview/target.js';

const envPath = resolve('api/../.env');
try { process.loadEnvFile(envPath); } catch { /* The runner may supply its test URL directly. */ }
const connectionString = process.env.TEST_DATABASE_URL;
const repositoryRoot = resolve('.');
const runId = `pv-e2e-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const createdTicketIds: string[] = [];
let client: Client | undefined;
let target: VerifiedTarget | undefined;
let manifest: Awaited<ReturnType<typeof provisionFixtures>>['manifest'] | undefined;
let files: Awaited<ReturnType<typeof provisionFixtures>>['files'] | undefined;
let outputDirectory: string | undefined;
let testDbVerified = false;
const contexts: BrowserContext[] = [];

type Account = { email: string; password: string; role: string; label: string; organizationId: string };

async function makePrivateDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'preview-lifecycle-'));
  if (process.platform === 'win32') {
    const identity = spawnSync('whoami.exe', [], { encoding: 'utf8' });
    const account = identity.status === 0 ? identity.stdout.trim() : '';
    if (!account) throw new Error('Cannot establish the current Windows account for the private fixture directory.');
    const result = spawnSync('icacls.exe', [directory, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Could not restrict the local fixture directory ACL.');
  } else {
    await chmod(directory, 0o700);
  }
  return directory;
}

function accountFor(accounts: Account[], organizationId: string, label: string): Account {
  const account = accounts.find((row) => row.organizationId === organizationId && row.label === label);
  if (!account) throw new Error('A required synthetic role account is missing from the private credential file.');
  return account;
}

async function signIn(browser: Browser, account: Account): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Ticket queue' })).toBeVisible();
  return { context, page };
}

async function ticketSnapshot(ticketId: string, organizationId: string) {
  const result = await client!.query(
    `SELECT t.id, t."organizationId", t."requesterUserId", t.title, t.description, t.status, t.priority, t.version,
       (SELECT count(*)::int FROM "Comment" c WHERE c."organizationId" = t."organizationId" AND c."ticketId" = t.id) AS comments,
       (SELECT count(*)::int FROM "ActivityEvent" a WHERE a."organizationId" = t."organizationId" AND a."ticketId" = t.id) AS events
     FROM "Ticket" t WHERE t.id = $1 AND t."organizationId" = $2`, [ticketId, organizationId],
  );
  if (result.rows.length !== 1) throw new Error('Expected a single synthetic ticket while taking a lifecycle snapshot.');
  return result.rows[0];
}

async function apiMutation(page: Page, input: { path: string; method: 'PATCH' | 'POST'; body: unknown; version?: number }) {
  return page.evaluate(async (request) => {
    const identityResponse = await fetch('/api/auth/me', { credentials: 'include' });
    const identity = await identityResponse.json() as { csrfToken: string; memberships: Array<{ organizationId: string }> };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CSRF-Token': identity.csrfToken,
      'X-Organization-ID': identity.memberships[0].organizationId,
    };
    if (request.version !== undefined) headers['X-Ticket-Version'] = String(request.version);
    const response = await fetch(request.path, {
      method: request.method,
      credentials: 'include',
      headers,
      body: JSON.stringify(request.body),
    });
    const payload = await response.json().catch(() => ({})) as { error?: { code?: string } };
    return { status: response.status, code: payload.error?.code ?? null };
  }, input);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  expect(connectionString, 'TEST_DATABASE_URL must identify the disposable local support_test database').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(connectionString!);
  const connected = await connectVerifiedTarget({
    connectionString: connectionString!,
    mode: 'local-test',
    expected: { endpointId: 'local', branchId: 'local', database: expected.database, username: expected.username },
    writeIntent: true,
  });
  client = connected.client;
  target = connected.identity;
  const identity = await client.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  testDbVerified = true;
  outputDirectory = await makePrivateDirectory();
  const provisioned = await provisionFixtures({ client, target, runId, outputDirectory, repositoryRoot });
  manifest = provisioned.manifest;
  files = provisioned.files;
});

test.afterAll(async () => {
  for (const context of contexts) await context.close().catch(() => undefined);
  if (!testDbVerified || !client || !target) return;
  if (!outputDirectory) {
    await client.end().catch(() => undefined);
    return;
  }
  const alpha = manifest?.organizations.find((row) => row.slug.endsWith('-alpha'));
  const customer = manifest?.users.find((row) => row.organizationId === alpha?.id && row.label === 'customer-one');
  const agent = manifest?.users.find((row) => row.organizationId === alpha?.id && row.label === 'agent');
  const recoveryErrors: string[] = [];
  let databaseCleanupConfirmed = false;
  try {
    if (alpha && agent) {
      // Restore the permitted admin role change even if the browser test stopped before its UI revert.
      try {
        await client.query(
          'UPDATE "Membership" SET role = $3 WHERE "organizationId" = $1 AND "userId" = $2',
          [alpha.id, agent.id, 'AGENT'],
        );
      } catch {
        recoveryErrors.push('agent-role restoration failed');
      }
    }
    for (const id of createdTicketIds) {
      if (!alpha || !customer) continue;
      let transactionOpen = false;
      try {
        await client.query('BEGIN');
        transactionOpen = true;
        const owned = await client.query(
          'SELECT id FROM "Ticket" WHERE id = $1 AND "organizationId" = $2 AND "requesterUserId" = $3',
          [id, alpha.id, customer.id],
        );
        if (owned.rows.length === 1) {
          await client.query('DELETE FROM "Comment" WHERE "organizationId" = $1 AND "ticketId" = $2', [alpha.id, id]);
          await client.query('DELETE FROM "ActivityEvent" WHERE "organizationId" = $1 AND "ticketId" = $2', [alpha.id, id]);
          await client.query('DELETE FROM "Ticket" WHERE id = $1 AND "organizationId" = $2 AND "requesterUserId" = $3',
            [id, alpha.id, customer.id]);
        }
        await client.query('COMMIT');
        transactionOpen = false;
      } catch {
        if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
        recoveryErrors.push('created-ticket reconciliation failed');
      }
    }
    const manifestPath = files?.manifestPath ?? resolve(outputDirectory, `preview-fixtures-${runId}.json`);
    let manifestExists = true;
    try {
      await access(manifestPath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') manifestExists = false;
      else recoveryErrors.push('manifest access check failed');
    }
    if (manifestExists) {
      try {
        await cleanupFixtures({ client, target, runId, manifestPath, repositoryRoot, confirm: true });
        if (files) await removeFixtureFiles(files);
        databaseCleanupConfirmed = true;
      } catch {
        recoveryErrors.push('manifest-scoped cleanup failed; recovery files retained');
      }
    } else {
      const residual = await client.query(
        `SELECT (SELECT count(*)::int FROM "Organization" WHERE slug LIKE $1) AS organizations,
                (SELECT count(*)::int FROM "User" WHERE email LIKE $2) AS users,
                (SELECT count(*)::int FROM "Ticket" WHERE title LIKE $3) AS tickets`,
        [`pv-${runId}-%`, `pv+${runId}-%`, `%${runId}%`],
      );
      databaseCleanupConfirmed = Object.values(residual.rows[0]).every((count) => count === 0);
      if (!databaseCleanupConfirmed) recoveryErrors.push('run-tagged rows remain without a manifest');
    }
    if (databaseCleanupConfirmed) {
      const residual = await client.query(
        `SELECT (SELECT count(*)::int FROM "Organization" WHERE slug LIKE $1) AS organizations,
                (SELECT count(*)::int FROM "User" WHERE email LIKE $2) AS users,
                (SELECT count(*)::int FROM "Ticket" WHERE title LIKE $3) AS tickets`,
        [`pv-${runId}-%`, `pv+${runId}-%`, `%${runId}%`],
      );
      expect(Object.values(residual.rows[0])).toEqual([0, 0, 0]);
      if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
      console.info(`LOCAL_ACCEPTANCE_CLEANUP ${JSON.stringify({ runId, residual: residual.rows[0], privateCredentialAndManifestFilesRemoved: true })}`);
    }
    if (recoveryErrors.length > 0) {
      console.error(`LOCAL_ACCEPTANCE_CLEANUP_INCOMPLETE ${JSON.stringify({ runId, issues: recoveryErrors, recoveryArtifactsPreserved: !databaseCleanupConfirmed })}`);
      throw new Error('Local lifecycle cleanup was incomplete; inspect the private recovery artifacts before retrying.');
    }
  } finally {
    await client.end().catch(() => undefined);
  }
});

test('provisions, authenticates, mutates, denies foreign access, reconciles, and cleans a local synthetic run', async ({ browser }) => {
  expect(manifest).toBeDefined();
  expect(files).toBeDefined();
  const credentials = JSON.parse(await readFile(files!.credentialsPath, 'utf8')) as { accounts: Account[] };
  const alpha = manifest!.organizations.find((row) => row.slug.endsWith('-alpha') )!;
  const beta = manifest!.organizations.find((row) => row.slug.endsWith('-beta'))!;
  const customerOne = accountFor(credentials.accounts, alpha.id, 'customer-one');
  const alphaAgent = accountFor(credentials.accounts, alpha.id, 'agent');
  const alphaAdmin = accountFor(credentials.accounts, alpha.id, 'admin');
  const alphaTicket = manifest!.tickets.find((ticket) => ticket.organizationId === alpha.id && ticket.requesterUserId === manifest!.users.find((user) => user.organizationId === alpha.id && user.label === 'customer-one')!.id)!;
  const otherCustomerTicket = manifest!.tickets.find((ticket) => ticket.organizationId === alpha.id && ticket.requesterUserId === manifest!.users.find((user) => user.organizationId === alpha.id && user.label === 'customer-two')!.id)!;
  const betaTicket = manifest!.tickets.find((ticket) => ticket.organizationId === beta.id)!;
  const permittedOperations: string[] = [];
  const denialResults: Array<{ role: string; operation: string; status: number; unchanged: boolean }> = [];

  const customerSession = await signIn(browser, customerOne);
  const customerTicketBefore = await ticketSnapshot(alphaTicket.id, alpha.id);
  await customerSession.page.goto(`/tickets/${alphaTicket.id}`);
  await expect(customerSession.page.getByRole('heading', { name: alphaTicket.label })).toBeVisible();
  await customerSession.page.getByLabel('Add a reply').fill('Synthetic customer lifecycle reply.');
  await customerSession.page.getByRole('button', { name: 'Send reply' }).click();
  await expect(customerSession.page.getByText('Synthetic customer lifecycle reply.')).toBeVisible();
  await expect(customerSession.page.locator('.ticket-detail-notice')).toContainText('Reply added');
  permittedOperations.push('customer authenticated, listed queue, opened own ticket, and added a comment');

  await customerSession.page.goto('/tickets/new');
  await customerSession.page.getByLabel('Subject').fill(`Lifecycle create ${runId}`);
  await customerSession.page.getByLabel('Description').fill(`Synthetic local lifecycle ${runId}`);
  await customerSession.page.getByRole('button', { name: 'Submit ticket' }).click();
  await expect(customerSession.page.getByRole('heading', { name: 'Ticket submitted' })).toBeVisible();
  const createdTicketId = customerSession.page.url().split('/').at(-1)!;
  expect(createdTicketId).toMatch(/^[0-9a-f-]{36}$/i);
  createdTicketIds.push(createdTicketId);
  permittedOperations.push('customer created a new ticket');

  const adminSession = await signIn(browser, alphaAdmin);
  await adminSession.page.getByRole('link', { name: 'Members', exact: true }).click();
  await expect(adminSession.page).toHaveURL('/admin/members');
  const agentRow = adminSession.page.getByRole('row').filter({ hasText: alphaAgent.email });
  await agentRow.getByLabel(`Role for ${alphaAgent.email}`).selectOption('CUSTOMER');
  const demotionResponsePromise = adminSession.page.waitForResponse((response) =>
    response.url().includes(`/api/memberships/${manifest!.users.find((user) => user.organizationId === alpha.id && user.label === 'agent')!.id}`)
      && response.request().method() === 'PATCH');
  await agentRow.getByRole('button', { name: `Save ${alphaAgent.email}` }).click();
  const demotionResponse = await demotionResponsePromise;
  expect(demotionResponse.ok()).toBe(true);
  await expect(agentRow.locator('td').nth(0)).toHaveText('Customer');
  await agentRow.getByLabel(`Role for ${alphaAgent.email}`).selectOption('AGENT');
  const restorationResponsePromise = adminSession.page.waitForResponse((response) =>
    response.url().includes(`/api/memberships/${manifest!.users.find((user) => user.organizationId === alpha.id && user.label === 'agent')!.id}`)
      && response.request().method() === 'PATCH');
  await agentRow.getByRole('button', { name: `Save ${alphaAgent.email}` }).click();
  const restorationResponse = await restorationResponsePromise;
  expect(restorationResponse.ok()).toBe(true);
  await expect(agentRow.locator('td').nth(0)).toHaveText('Agent');
  const membership = await client!.query('SELECT role FROM "Membership" WHERE "organizationId" = $1 AND "userId" = $2', [alpha.id, manifest!.users.find((user) => user.organizationId === alpha.id && user.label === 'agent')!.id]);
  expect(membership.rows[0]?.role).toBe('AGENT');
  permittedOperations.push('admin changed and restored an agent membership through the browser');

  const agentSession = await signIn(browser, alphaAgent);
  await agentSession.page.goto(`/tickets/${alphaTicket.id}`);
  const updatedTitle = `${alphaTicket.label} updated ${runId}`;
  await agentSession.page.getByLabel('Subject').fill(updatedTitle);
  await agentSession.page.getByLabel('Priority').selectOption('HIGH');
  await agentSession.page.getByRole('button', { name: 'Save changes' }).click();
  await expect(agentSession.page.locator('.ticket-detail-notice')).toContainText('Ticket updated');
  await agentSession.page.getByLabel('Add a reply').fill('Synthetic agent lifecycle note.');
  await agentSession.page.getByRole('button', { name: 'Send reply' }).click();
  await expect(agentSession.page.getByText('Synthetic agent lifecycle note.')).toBeVisible();
  await expect(agentSession.page.getByRole('status')).toContainText('Reply added');
  const updatedTicket = await ticketSnapshot(alphaTicket.id, alpha.id);
  expect(updatedTicket.title).toBe(updatedTitle);
  expect(updatedTicket.priority).toBe('HIGH');
  expect(Number(updatedTicket.version)).toBeGreaterThan(Number(customerTicketBefore.version));
  expect(Number(updatedTicket.comments)).toBe(Number(customerTicketBefore.comments) + 2);
  expect(Number(updatedTicket.events)).toBeGreaterThan(Number(customerTicketBefore.events));
  permittedOperations.push('agent updated the owned-organization ticket and added a comment with activity history');

  const sameTenantBefore = await ticketSnapshot(otherCustomerTicket.id, alpha.id);
  const sameTenantRead = customerSession.page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/tickets/${otherCustomerTicket.id}` && response.request().method() === 'GET');
  await customerSession.page.goto(`/tickets/${otherCustomerTicket.id}`);
  const sameReadResponse = await sameTenantRead;
  await expect(customerSession.page.getByRole('heading', { name: 'Ticket unavailable' })).toBeVisible();
  expect(sameReadResponse.status()).toBe(404);
  denialResults.push({ role: 'Alpha customer-one', operation: 'same-tenant other-customer read', status: sameReadResponse.status(), unchanged: true });
  const samePatch = await apiMutation(customerSession.page, {
    path: `/api/tickets/${otherCustomerTicket.id}`, method: 'PATCH', version: Number(sameTenantBefore.version),
    body: { title: `forbidden ${runId}` },
  });
  const sameComment = await apiMutation(customerSession.page, {
    path: `/api/tickets/${otherCustomerTicket.id}/comments`, method: 'POST', body: { body: `forbidden ${runId}` },
  });
  const sameTenantAfter = await ticketSnapshot(otherCustomerTicket.id, alpha.id);
  expect(samePatch.status).toBe(404);
  expect(sameComment.status).toBe(404);
  expect(sameTenantAfter).toEqual(sameTenantBefore);
  denialResults.push(
    { role: 'Alpha customer-one', operation: 'same-tenant other-customer update', status: samePatch.status, unchanged: true },
    { role: 'Alpha customer-one', operation: 'same-tenant other-customer comment', status: sameComment.status, unchanged: true },
  );

  const betaBefore = await ticketSnapshot(betaTicket.id, beta.id);
  const betaRead = agentSession.page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/tickets/${betaTicket.id}` && response.request().method() === 'GET');
  await agentSession.page.goto(`/tickets/${betaTicket.id}`);
  const betaReadResponse = await betaRead;
  await expect(agentSession.page.getByRole('heading', { name: 'Ticket unavailable' })).toBeVisible();
  expect(betaReadResponse.status()).toBe(404);
  const betaUpdate = await apiMutation(agentSession.page, {
    path: `/api/tickets/${betaTicket.id}`, method: 'PATCH', version: Number(betaBefore.version), body: { title: `cross-tenant ${runId}` },
  });
  const betaAssignment = await apiMutation(agentSession.page, {
    path: `/api/tickets/${betaTicket.id}/assignment`, method: 'PATCH', version: Number(betaBefore.version), body: { assigneeUserId: null },
  });
  const betaComment = await apiMutation(agentSession.page, {
    path: `/api/tickets/${betaTicket.id}/comments`, method: 'POST', body: { body: `cross-tenant ${runId}` },
  });
  const betaAfter = await ticketSnapshot(betaTicket.id, beta.id);
  expect([betaReadResponse.status(), betaUpdate.status, betaAssignment.status, betaComment.status]).toEqual([404, 404, 404, 404]);
  expect(betaAfter).toEqual(betaBefore);
  denialResults.push(
    { role: 'Alpha agent', operation: 'cross-tenant Beta ticket read', status: betaReadResponse.status(), unchanged: true },
    { role: 'Alpha agent', operation: 'cross-tenant Beta ticket update', status: betaUpdate.status, unchanged: true },
    { role: 'Alpha agent', operation: 'cross-tenant Beta ticket assignment', status: betaAssignment.status, unchanged: true },
    { role: 'Alpha agent', operation: 'cross-tenant Beta ticket comment', status: betaComment.status, unchanged: true },
  );

  expect(denialResults.every((row) => row.status === 404 && row.unchanged)).toBe(true);
  console.info(`LOCAL_ACCEPTANCE_LIFECYCLE ${JSON.stringify({ runId, alphaTicketId: alphaTicket.id, otherCustomerTicketId: otherCustomerTicket.id, betaTicketId: betaTicket.id, createdTicketId, permittedOperations, denials: denialResults, snapshots: { customerOwnTicketBefore: customerTicketBefore, customerOwnTicketAfter: updatedTicket, sameTenantBefore: sameTenantBefore, sameTenantAfter: sameTenantAfter, betaBefore, betaAfter } })}`);
});
