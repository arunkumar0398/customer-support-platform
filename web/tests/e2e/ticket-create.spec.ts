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
const agentId = randomUUID();
const adminId = randomUUID();
const customerIds = Array.from({ length: 3 }, () => randomUUID());
const emailByUserId = new Map<string, string>();
const password = 'synthetic-ticket-create-fixture-password';
for (const [index, id] of customerIds.entries()) emailByUserId.set(id, `create-customer-${index}-${id}@example.test`);
emailByUserId.set(agentId, `create-agent-${agentId}@example.test`);
emailByUserId.set(adminId, `create-admin-${adminId}@example.test`);
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
    data: { id: organizationId, slug: `create-${organizationId}`, name: 'Ticket creation fixture' },
  });
  await db.user.create({
    data: {
      id: agentId,
      email: emailByUserId.get(agentId)!,
      passwordHash,
      memberships: { create: { organizationId, role: 'AGENT' } },
    },
  });
  await db.user.create({
    data: {
      id: adminId,
      email: emailByUserId.get(adminId)!,
      passwordHash,
      memberships: { create: { organizationId, role: 'ADMIN' } },
    },
  });
  await Promise.all(customerIds.map((id) => db.user.create({
    data: {
      id,
      email: emailByUserId.get(id)!,
      passwordHash,
      memberships: { create: { organizationId, role: 'CUSTOMER' } },
    },
  })));
});

test.afterAll(async () => {
  if (verified) {
    await db.activityEvent.deleteMany({ where: { organizationId } });
    await db.ticket.deleteMany({ where: { organizationId } });
    await db.session.deleteMany({ where: { userId: { in: [agentId, adminId, ...customerIds] } } });
    await db.membership.deleteMany({ where: { organizationId } });
    await db.user.deleteMany({ where: { id: { in: [agentId, adminId, ...customerIds] } } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  await db.$disconnect();
  await verifier.end();
});

async function signIn(page: Page, id: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(emailByUserId.get(id)!);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function openCreateForm(page: Page) {
  await page.getByRole('link', { name: 'Create ticket' }).click();
  await expect(page).toHaveURL('/tickets/new');
  await expect(page.getByRole('heading', { name: 'Create a ticket' })).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
}

test('customer ticket form requires nonblank fields and rejects whitespace-only content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, customerIds[0]);
  await openCreateForm(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await captureCheckpointScreenshot(page, '05-ticket-create-mobile.png');

  const title = page.getByLabel('Subject');
  const description = page.getByLabel('Description');
  await title.focus();
  await page.keyboard.press('Tab');
  await expect(description).toBeFocused();
  expect(await description.evaluate((input) => getComputedStyle(input).boxShadow)).not.toBe('none');
  await page.getByRole('button', { name: 'Submit ticket' }).click();
  expect(await title.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  expect(await description.evaluate((input: HTMLTextAreaElement) => input.validity.valueMissing)).toBe(true);
  await expect.poll(() => db.ticket.count({ where: { organizationId } })).toBe(0);

  await title.fill('A useful subject');
  await description.fill('   ');
  await page.getByRole('button', { name: 'Submit ticket' }).click();
  await expect(page.getByRole('alert')).toContainText('Description must contain at least one non-space character.');
  await expect(page).toHaveURL('/tickets/new');
  await expect.poll(() => db.ticket.count({ where: { organizationId } })).toBe(0);
});

test('customer can create a ticket and reaches its submission confirmation', async ({ page }) => {
  await signIn(page, customerIds[1]);
  await openCreateForm(page);
  await captureCheckpointScreenshot(page, '06-ticket-create-desktop.png');
  await page.getByLabel('Subject').fill('Cannot access billing history');
  await page.getByLabel('Description').fill('The billing history page returns an error after sign in.');
  await page.getByRole('button', { name: 'Submit ticket' }).click();

  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]+$/i);
  await expect(page.getByRole('heading', { name: 'Ticket submitted' })).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByText('Cannot access billing history')).toBeVisible();
  await expect(page.getByText(/Ticket #1\b/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to ticket queue' })).toHaveAttribute('href', '/');

  const ticket = await db.ticket.findFirst({ where: { organizationId, requesterUserId: customerIds[1] } });
  expect(ticket).toMatchObject({
    requesterUserId: customerIds[1],
    title: 'Cannot access billing history',
    status: 'OPEN',
    priority: 'MEDIUM',
  });
  await page.getByRole('link', { name: 'Return to ticket queue' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('row', { name: /Cannot access billing history/ })).toBeVisible();
});

test('staff can create a ticket for an active same-organization customer with selected priority', async ({ page }) => {
  await signIn(page, agentId);
  await openCreateForm(page);
  await page.getByLabel('Customer membership ID').fill(customerIds[2]);
  await page.getByLabel('Priority').selectOption('URGENT');
  await page.getByLabel('Subject').fill('Agent-created follow-up');
  await page.getByLabel('Description').fill('The customer called and requested an urgent follow-up.');
  await page.getByRole('button', { name: 'Submit ticket' }).click();

  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]+$/i);
  await expect(page.getByRole('heading', { name: 'Ticket submitted' })).toBeVisible();
  await expect(page.getByText('Urgent priority')).toBeVisible();
  const ticket = await db.ticket.findFirst({ where: { organizationId, requesterUserId: customerIds[2] } });
  expect(ticket).toMatchObject({ requesterUserId: customerIds[2], priority: 'URGENT', title: 'Agent-created follow-up' });
});

test('admin can create a ticket for an active same-organization customer', async ({ page }) => {
  await signIn(page, adminId);
  await openCreateForm(page);
  await page.getByLabel('Customer membership ID').fill(customerIds[0]);
  await page.getByLabel('Subject').fill('Admin-created ticket');
  await page.getByLabel('Description').fill('The organization administrator created a synthetic ticket.');
  await page.getByRole('button', { name: 'Submit ticket' }).click();
  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]+$/i);
  await expect(page.getByRole('heading', { name: 'Ticket submitted' })).toBeVisible();
  await expect.poll(() => db.ticket.count({ where: { organizationId, requesterUserId: customerIds[0] } })).toBe(1);
});

test('server rejects a customer requester-id field injected into the create request', async ({ page }) => {
  await signIn(page, customerIds[2]);
  await openCreateForm(page);
  const ticketsBeforeAttempt = await db.ticket.count({ where: { organizationId } });
  await page.getByLabel('Subject').fill('Attempted requester spoof');
  await page.getByLabel('Description').fill('The browser request is modified to add a requester id.');
  await expect(page.getByLabel('Customer membership ID')).toHaveCount(0);

  await page.route('**/api/tickets', async (route) => {
    const requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.continue({
      postData: JSON.stringify({ ...requestBody, requesterUserId: customerIds[0] }),
    });
  });
  await page.getByRole('button', { name: 'Submit ticket' }).click();

  await expect(page.getByRole('alert')).toContainText('Request body is invalid.');
  await expect(page).toHaveURL('/tickets/new');
  await expect.poll(() => db.ticket.count({ where: { organizationId } })).toBe(ticketsBeforeAttempt);
});
