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

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const testUrl = process.env.TEST_DATABASE_URL;
const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 2 }) });
const organizationId = randomUUID();
const agentId = randomUUID();
const customerId = randomUUID();
const ticketIds = [randomUUID(), randomUUID(), randomUUID()];
const agentEmail = `dashboard-ui-${agentId}@example.test`;
const customerEmail = `dashboard-ui-${customerId}@example.test`;
const password = 'synthetic-dashboard-ui-fixture-password';
let verified = false;

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(agentEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test.beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required for dashboard browser fixtures').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;

  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.organization.create({
    data: { id: organizationId, slug: `dashboard-ui-${organizationId}`, name: 'Dashboard UI fixture' },
  });
  await db.user.createMany({
    data: [
      { id: agentId, email: agentEmail, passwordHash },
      { id: customerId, email: customerEmail, passwordHash },
    ],
  });
  await db.membership.createMany({ data: [
    { organizationId, userId: agentId, role: 'AGENT' },
    { organizationId, userId: customerId, role: 'CUSTOMER' },
  ] });
  await db.ticket.createMany({ data: [
    {
      id: ticketIds[0], organizationId, ticketNumber: 1, requesterUserId: customerId,
      assigneeOrganizationId: organizationId, assigneeUserId: agentId,
      title: 'Dashboard open fixture', description: 'Open synthetic dashboard ticket.',
      status: 'OPEN', priority: 'HIGH', dueAt: new Date(Date.now() + 86_400_000),
    },
    {
      id: ticketIds[1], organizationId, ticketNumber: 2, requesterUserId: customerId,
      assigneeOrganizationId: organizationId, assigneeUserId: agentId,
      title: 'Dashboard active fixture', description: 'In-progress synthetic dashboard ticket.',
      status: 'IN_PROGRESS', priority: 'MEDIUM', dueAt: new Date(Date.now() - 86_400_000),
    },
    {
      id: ticketIds[2], organizationId, ticketNumber: 3, requesterUserId: customerId,
      title: 'Dashboard unassigned fixture', description: 'Unassigned synthetic dashboard ticket.',
      status: 'OPEN', priority: 'LOW', dueAt: new Date(Date.now() + 86_400_000),
    },
  ] });
  await db.activityEvent.createMany({ data: ticketIds.map((ticketId, index) => ({
    organizationId, ticketId, actorUserId: customerId, type: 'TICKET_CREATED',
    newValue: {
      title: ['Dashboard open fixture', 'Dashboard active fixture', 'Dashboard unassigned fixture'][index],
      status: index === 1 ? 'IN_PROGRESS' : 'OPEN',
    },
  })) });
});

test.afterAll(async () => {
  if (verified) {
    await db.activityEvent.deleteMany({ where: { organizationId } });
    await db.comment.deleteMany({ where: { organizationId } });
    await db.ticket.deleteMany({ where: { organizationId } });
    await db.session.deleteMany({ where: { userId: { in: [agentId, customerId] } } });
    await db.membership.deleteMany({ where: { organizationId } });
    await db.user.deleteMany({ where: { id: { in: [agentId, customerId] } } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  await db.$disconnect();
  await verifier.end();
});

test('staff dashboard explains tenant metrics and refreshes after ticket changes', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/dashboard', async (route) => {
    await page.waitForTimeout(250);
    await route.continue();
  });
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();

  await expect(page.getByRole('status')).toContainText('Loading dashboard');
  await expect(page.getByRole('heading', { name: 'Team dashboard' })).toBeVisible();
  await page.unroute('**/api/dashboard');
  const totals = page.getByRole('region', { name: 'Support totals' });
  await expect(totals.getByText('3', { exact: true })).toBeVisible();
  await expect(page.getByTestId('status-count-OPEN').getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByTestId('status-count-IN_PROGRESS').getByText('1', { exact: true })).toBeVisible();
  await expect(page.getByText('1 overdue ticket')).toBeVisible();
  await expect(page.getByText('Overdue means a due date before this snapshot while the ticket is still open or in progress.')).toBeVisible();
  await expect(page.getByText('Active workload includes assigned open and in-progress tickets only.')).toBeVisible();
  await expect(page.getByText(/Metrics as of .* UTC/)).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(agentEmail) })).toContainText('1 open');
  await expect(page.getByRole('row', { name: new RegExp(agentEmail) })).toContainText('1 in progress');
  await expect(page.getByRole('region', { name: 'Agent workload' })).toContainText('2 assigned active tickets');
  await captureCheckpointScreenshot(page, '09-dashboard-desktop.png');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.getByRole('link', { name: 'Ticket queue', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  await captureCheckpointScreenshot(page, '10-dashboard-mobile.png');
  await page.getByRole('link', { name: 'Ticket queue', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Ticket queue' })).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL('/dashboard');
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole('link', { name: 'Support Desk home' }).click();
  await page.getByRole('link', { name: /Dashboard open fixture/ }).click();
  await page.getByLabel('Ticket status').selectOption('RESOLVED');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Ticket updated');

  await page.route('**/api/dashboard', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Dashboard temporarily unavailable.' } }),
  }));
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Dashboard temporarily unavailable.');
  await page.unroute('**/api/dashboard');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('status-count-OPEN').getByText('1', { exact: true })).toBeVisible();
  await expect(page.getByTestId('status-count-IN_PROGRESS').getByText('1', { exact: true })).toBeVisible();
  await expect(page.getByTestId('status-count-RESOLVED').getByText('1', { exact: true })).toBeVisible();
  await expect(page.getByText('1 overdue ticket')).toBeVisible();

  await db.activityEvent.deleteMany({ where: { organizationId } });
  await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await page.getByRole('button', { name: 'Refresh dashboard' }).click();
  await expect(page.getByRole('status')).toContainText('No tickets yet');

  await db.membership.update({
    where: { organizationId_userId: { organizationId, userId: agentId } },
    data: { role: 'CUSTOMER' },
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(`${agentEmail} · customer`)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('You do not have access to the dashboard');
  await expect(page.getByRole('region', { name: 'Support totals' })).toHaveCount(0);
});
