import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { PrismaClient } from '../../../api/src/generated/prisma/client.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';
import { captureCheckpointScreenshot } from './capture-checkpoint-screenshot.js';

test.describe.configure({ mode: 'serial' });

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const testUrl = process.env.TEST_DATABASE_URL;
const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 2 }) });
const organizationId = randomUUID();
const agentIds = [randomUUID(), randomUUID()];
const customerIds = [randomUUID(), randomUUID()];
const adminId = randomUUID();
const userIds = [...agentIds, ...customerIds, adminId];
const emailByUserId = new Map(userIds.map((id, index) => [id, id === adminId ? `detail-admin-${id}@example.test` : `detail-${index}-${id}@example.test`]));
const password = 'synthetic-ticket-detail-fixture-password';
const ticketIds = [randomUUID(), randomUUID(), randomUUID()];
let verified = false;

test.beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required for browser fixtures').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;

  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.organization.create({
    data: { id: organizationId, slug: `detail-${organizationId}`, name: 'Ticket detail fixture' },
  });
  await Promise.all(userIds.map((id, index) => db.user.create({
    data: {
      id,
      email: emailByUserId.get(id)!,
      passwordHash,
      memberships: { create: { organizationId, role: id === adminId ? 'ADMIN' : index < agentIds.length ? 'AGENT' : 'CUSTOMER' } },
    },
  })));
  await db.ticket.createMany({
    data: ticketIds.map((id, index) => ({
      id, organizationId, ticketNumber: index + 1,
      requesterUserId: customerIds[index === 2 ? 1 : 0],
      title: `Detail fixture ${index + 1}`,
      description: `Synthetic detail description ${index + 1}`,
      status: 'OPEN', priority: 'MEDIUM',
    })),
  });
  await db.activityEvent.create({
    data: {
      organizationId, ticketId: ticketIds[0], actorUserId: customerIds[0],
      type: 'TICKET_CREATED', newValue: { title: 'Detail fixture 1', status: 'OPEN' },
    },
  });
  await db.comment.create({
    data: {
      organizationId, ticketId: ticketIds[2], authorUserId: customerIds[1],
      body: 'Private comment on a different customer ticket.',
    },
  });
  await db.activityEvent.createMany({
    data: [
      { organizationId, ticketId: ticketIds[2], actorUserId: customerIds[1], type: 'TICKET_CREATED', newValue: { title: 'Detail fixture 3', status: 'OPEN' } },
      { organizationId, ticketId: ticketIds[2], actorUserId: customerIds[1], type: 'COMMENT_ADDED', newValue: { body: 'private history marker' } },
    ],
  });
});

test.afterAll(async () => {
  if (verified) {
    await db.activityEvent.deleteMany({ where: { organizationId } });
    await db.comment.deleteMany({ where: { organizationId } });
    await db.ticket.deleteMany({ where: { organizationId } });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.membership.deleteMany({ where: { organizationId } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  await db.$disconnect();
  await verifier.end();
});

async function signIn(page: Page, userId: (typeof userIds)[number]) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(emailByUserId.get(userId)!);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test('customer opens an owned ticket, reads history, and adds a chronological comment', async ({ page }) => {
  await signIn(page, customerIds[0]);
  await expect(page.getByRole('row', { name: /Detail fixture 1/ })).toBeVisible();
  await page.getByRole('link', { name: /Detail fixture 1/ }).click();

  await expect(page).toHaveURL(`/tickets/${ticketIds[0]}`);
  await expect(page.getByRole('heading', { name: 'Detail fixture 1' })).toBeVisible();
  await expect(page.getByText('Synthetic detail description 1')).toBeVisible();
  await captureCheckpointScreenshot(page, '07-ticket-detail-desktop.png');
  await expect(page.getByText('Ticket created')).toBeVisible();
  await expect(page.getByLabel('Add a reply')).toBeVisible();
  await expect(page.getByLabel('Ticket status')).toHaveCount(0);
  await expect(page.getByLabel('Assign to agent ID')).toHaveCount(0);

  await page.getByLabel('Add a reply').fill('I can reproduce this on my account.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('I can reproduce this on my account.')).toBeVisible();
  await expect(page.getByText('Comment added')).toBeVisible();
  await expect.poll(() => db.comment.count({ where: { organizationId, ticketId: ticketIds[0] } })).toBe(1);

  const result = await page.evaluate(async ({ organizationId, ticketId, assigneeUserId }) => {
    const identityResponse = await fetch('/api/auth/me');
    const identity = await identityResponse.json() as { csrfToken: string };
    const response = await fetch(`/api/tickets/${ticketId}/assignment`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': identity.csrfToken,
        'X-Organization-ID': organizationId,
        'X-Ticket-Version': '1',
      },
      body: JSON.stringify({ assigneeUserId }),
    });
    return { status: response.status, body: await response.json() };
  }, { organizationId, ticketId: ticketIds[1], assigneeUserId: agentIds[1] });

  expect(result.status).toBe(403);
  expect(result.body.error.code).toBe('FORBIDDEN');
  expect(await db.ticket.findUnique({ where: { id: ticketIds[1] }, select: { assigneeUserId: true, version: true } }))
    .toMatchObject({ assigneeUserId: null, version: 1 });
});

test('admin can open ticket detail and access staff controls', async ({ page }) => {
  await signIn(page, adminId);
  await page.goto(`/tickets/${ticketIds[0]}`);
  await expect(page.getByRole('heading', { name: 'Detail fixture 1' })).toBeVisible();
  await expect(page.getByLabel('Ticket status')).toBeVisible();
  await expect(page.getByLabel('Assign to agent ID')).toBeVisible();
  await expect(page.getByLabel('Subject')).toHaveValue('Detail fixture 1');
});

test('customer can read and reply to a ticket from a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, customerIds[0]);
  await page.goto(`/tickets/${ticketIds[1]}`);
  await expect(page.getByRole('heading', { name: 'Detail fixture 2' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByLabel('Add a reply').fill('Mobile customer detail reply.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('Mobile customer detail reply.')).toBeVisible();
  await expect.poll(() => db.comment.count({ where: { organizationId, ticketId: ticketIds[1] } })).toBe(1);
});

test('staff can edit, transition, assign, and inspect ticket history', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, agentIds[0]);
  await page.goto(`/tickets/${ticketIds[0]}`);
  await expect(page.getByRole('heading', { name: 'Detail fixture 1' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(await page.locator('.ticket-detail-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
  await captureCheckpointScreenshot(page, '08-ticket-detail-mobile.png');

  await page.getByLabel('Subject').fill('Updated detail fixture');
  await page.getByLabel('Description').fill('Updated description from the support team.');
  await page.getByLabel('Ticket status').selectOption('IN_PROGRESS');
  await page.getByLabel('Priority').selectOption('HIGH');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Ticket updated');
  await expect(page.getByText('Status changed')).toBeVisible();
  await expect(page.getByText('Priority changed')).toBeVisible();

  await page.getByLabel('Assign to agent ID').fill(agentIds[1]);
  await page.getByRole('button', { name: 'Save assignment' }).click();
  await expect(page.getByRole('status')).toContainText('Assignment updated');
  await expect(page.getByText('Assignment changed')).toBeVisible();
  const ticket = await db.ticket.findUnique({ where: { id: ticketIds[0] } });
  expect(ticket).toMatchObject({ title: 'Updated detail fixture', status: 'IN_PROGRESS', priority: 'HIGH', assigneeUserId: agentIds[1] });
});

test('invalid staff transition is shown as a server denial without hiding the current state', async ({ page }) => {
  await signIn(page, agentIds[0]);
  await page.goto(`/tickets/${ticketIds[1]}`);
  await expect(page.getByRole('heading', { name: 'Detail fixture 2' })).toBeVisible();
  await page.getByLabel('Ticket status').selectOption('IN_PROGRESS');
  await page.route(`**/api/tickets/${ticketIds[1]}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.continue({ postData: JSON.stringify({ ...body, status: 'CLOSED' }) });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('Ticket status cannot transition');
  await expect(page.getByLabel('Ticket status')).toHaveValue('OPEN');
  await expect.poll(() => db.ticket.findUnique({ where: { id: ticketIds[1] }, select: { status: true, version: true } }))
    .toMatchObject({ status: 'OPEN', version: 1 });
});

test('role downgrade clears cached ticket detail, comments, and activity', async ({ page }) => {
  await signIn(page, agentIds[1]);
  await page.goto(`/tickets/${ticketIds[2]}`);
  await expect(page.getByRole('heading', { name: 'Detail fixture 3' })).toBeVisible();
  await expect(page.getByText('Private comment on a different customer ticket.')).toBeVisible();
  await expect(page.getByText('Ticket created')).toBeVisible();

  await db.membership.update({
    where: { organizationId_userId: { organizationId, userId: agentIds[1] } },
    data: { role: 'CUSTOMER' },
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(page.getByRole('heading', { name: 'Ticket unavailable' })).toBeVisible();
  await expect(page.getByText('Private comment on a different customer ticket.')).toHaveCount(0);
  await expect(page.getByText('Synthetic detail description 3')).toHaveCount(0);
  await expect(page.getByText('Ticket created')).toHaveCount(0);
  await expect(page.getByText(`${emailByUserId.get(agentIds[1])} · customer`)).toBeVisible();
});

test('stale edit shows a refresh path and allows retry with the current version', async ({ page }) => {
  await signIn(page, agentIds[0]);
  await page.goto(`/tickets/${ticketIds[2]}`);
  await expect(page.getByRole('heading', { name: 'Detail fixture 3' })).toBeVisible();

  await db.ticket.update({
    where: { id: ticketIds[2] },
    data: { title: 'Concurrent staff update', version: { increment: 1 } },
  });
  await page.getByLabel('Subject').fill('My stale edit');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('Ticket version is stale');
  await page.getByRole('button', { name: 'Refresh ticket' }).click();
  await expect(page.getByLabel('Subject')).toHaveValue('Concurrent staff update');

  await page.getByLabel('Description').fill('Retry using the refreshed version.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Ticket updated');
  await expect.poll(() => db.ticket.findUnique({ where: { id: ticketIds[2] }, select: { description: true } }))
    .toMatchObject({ description: 'Retry using the refreshed version.' });
});
