import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { PrismaClient } from '../../../api/src/generated/prisma/client.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';

test.describe.configure({ mode: 'serial' });

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const testUrl = process.env.TEST_DATABASE_URL;
const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 2 }) });
const organizationId = randomUUID();
const agentIds = Array.from({ length: 9 }, () => randomUUID());
const customerId = randomUUID();
const otherCustomerId = randomUUID();
const password = 'synthetic-ticket-list-fixture-password';
const agentEmails = agentIds.map((id) => `queue-agent-${id}@example.test`);
const customerEmail = `queue-customer-${customerId}@example.test`;
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
    data: { id: organizationId, slug: `queue-${organizationId}`, name: 'Ticket queue fixture' },
  });
  await Promise.all(agentIds.map((id, index) => db.user.create({
    data: {
      id,
      email: agentEmails[index],
      passwordHash,
      memberships: { create: { organizationId, role: 'AGENT' } },
    },
  })));
  await db.user.create({
    data: {
      id: customerId,
      email: customerEmail,
      passwordHash,
      memberships: { create: { organizationId, role: 'CUSTOMER' } },
    },
  });
  await db.user.create({
    data: {
      id: otherCustomerId,
      email: `queue-other-${otherCustomerId}@example.test`,
      passwordHash,
      memberships: { create: { organizationId, role: 'CUSTOMER' } },
    },
  });
  await db.ticket.createMany({
    data: Array.from({ length: 26 }, (_, index) => {
      const createdAt = new Date(Date.now() - index * 1000);
      return {
        organizationId,
        ticketNumber: index + 1,
        requesterUserId: index === 25 ? otherCustomerId : customerId,
        assigneeOrganizationId: index === 0 ? organizationId : null,
        assigneeUserId: index === 0 ? agentIds[1] : null,
        title: index === 6 ? 'Invoice discrepancy seven' : `Queue request ${String(index + 1).padStart(2, '0')}`,
        description: index === 6 ? 'Invoice charge needs review.' : 'Synthetic queue test record.',
        status: index === 6 ? 'IN_PROGRESS' as const : 'OPEN' as const,
        priority: index === 6 ? 'HIGH' as const : 'MEDIUM' as const,
        createdAt,
        updatedAt: createdAt,
      };
    }),
  });
});

test.afterAll(async () => {
  if (verified) {
    await db.ticket.deleteMany({ where: { organizationId } });
    await db.session.deleteMany({ where: { userId: { in: [...agentIds, customerId, otherCustomerId] } } });
    await db.membership.deleteMany({ where: { organizationId } });
    await db.user.deleteMany({ where: { id: { in: [...agentIds, customerId, otherCustomerId] } } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  await db.$disconnect();
  await verifier.end();
});

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test('staff search and status filters update the queue and URL', async ({ page }) => {
  await signIn(page, agentEmails[0]);

  await expect(page.getByRole('heading', { name: 'Ticket queue' })).toBeVisible();
  await expect(page.getByText('26 tickets')).toBeVisible();
  await page.getByLabel('Search tickets').fill('Invoice discrepancy');
  await page.getByLabel('Search tickets').press('Enter');
  await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe('Invoice discrepancy');
  await expect(page.getByRole('row', { name: /Invoice discrepancy seven/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Queue request/ })).toHaveCount(0);

  await page.getByLabel('Status').selectOption('IN_PROGRESS');
  await expect(page).toHaveURL(/status=IN_PROGRESS/);
  await expect(page.getByRole('row', { name: /Invoice discrepancy seven/ })).toBeVisible();
  await expect(page.getByText('1 ticket')).toBeVisible();

  await page.getByLabel('Priority').selectOption('HIGH');
  await expect(page).toHaveURL(/priority=HIGH/);
  await expect(page.getByRole('row', { name: /Invoice discrepancy seven/ })).toBeVisible();
  await page.getByLabel('Search tickets').fill('');
  await page.getByLabel('Search tickets').press('Enter');
  await page.getByLabel('Status').selectOption('');
  await page.getByLabel('Priority').selectOption('');
  await expect(page.getByText('26 tickets')).toBeVisible();
  await page.getByLabel('Assignee ID').fill('unassigned');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/assigneeId=unassigned/);
  await expect(page.getByText('25 tickets')).toBeVisible();
  await expect(page.getByRole('row', { name: /Queue request 01/ })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Queue request 02/ })).toBeVisible();
  await page.getByLabel('Assignee ID').fill('');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).not.toHaveURL(/assigneeId/);
  await expect(page.getByText('26 tickets')).toBeVisible();
});

test('customers only see their own tickets in the queue', async ({ page }) => {
  await signIn(page, customerEmail);

  await expect(page.getByText('25 tickets')).toBeVisible();
  await expect(page.getByRole('row', { name: /Queue request 25/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Queue request 26/ })).toHaveCount(0);
  await expect(page.getByLabel('Assignee ID')).toBeHidden();
});

test('staff can filter tickets by customer membership id', async ({ page }) => {
  await signIn(page, agentEmails[1]);

  await page.getByLabel('Customer ID').fill(customerId);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('customerId')).toBe(customerId);
  await expect(page.getByText('25 tickets')).toBeVisible();
  await expect(page.getByRole('row', { name: /Queue request 25/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Queue request 26/ })).toHaveCount(0);
});

test('staff can filter tickets by a specific assignee', async ({ page }) => {
  await signIn(page, agentEmails[6]);

  await page.getByLabel('Assignee ID').fill(agentIds[1]);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('assigneeId')).toBe(agentIds[1]);
  await expect(page.getByText('1 ticket')).toBeVisible();
  await expect(page.getByRole('row', { name: /Queue request 01/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Queue request 02/ })).toHaveCount(0);
});

test('staff queue refreshes when membership is downgraded while open', async ({ page }) => {
  await signIn(page, agentEmails[7]);
  await expect(page.getByText('26 tickets')).toBeVisible();

  await db.membership.update({
    where: { organizationId_userId: { organizationId, userId: agentIds[7] } },
    data: { role: 'CUSTOMER' },
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(page.getByText(`${agentEmails[7]} · customer`)).toBeVisible();
  await expect(page.getByLabel('Assignee ID')).toHaveCount(0);
  await expect(page.getByText('0 tickets')).toBeVisible();
});

test('a delayed membership refresh cannot restore the UI after sign-out', async ({ page }) => {
  await signIn(page, agentEmails[8]);
  await expect(page.getByText('26 tickets')).toBeVisible();
  await db.membership.update({
    where: { organizationId_userId: { organizationId, userId: agentIds[8] } },
    data: { role: 'CUSTOMER' },
  });

  let releaseResponse!: () => void;
  let markResponseReady!: () => void;
  const heldResponse = new Promise<void>((resolve) => { releaseResponse = resolve; });
  const responseReady = new Promise<void>((resolve) => { markResponseReady = resolve; });
  await page.route('**/api/auth/me', async (route) => {
    const response = await route.fetch();
    markResponseReady();
    await heldResponse;
    await route.fulfill({ response });
  });

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await responseReady;
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/sign-in');
  releaseResponse();
  await expect(page.getByRole('heading', { name: 'Sign in to Support Desk' })).toBeVisible();
  await expect(page).toHaveURL('/sign-in');
  await page.unroute('**/api/auth/me');
});

test('queue pagination keeps page state in the URL', async ({ page }) => {
  await signIn(page, agentEmails[2]);

  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(page.getByRole('row', { name: /Queue request 26/ })).toBeVisible();
  await page.getByLabel('Search tickets').fill('not a match');
  await page.getByLabel('Search tickets').press('Enter');
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.getByText('No tickets match these filters')).toBeVisible();
});

test('ticket queue fits a narrow viewport and keeps the table scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, agentEmails[3]);

  await expect(page.getByRole('heading', { name: 'Ticket queue' })).toBeVisible();
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(375);
  const table = await page.locator('.ticket-table').evaluate((element) => ({
    contentWidth: element.scrollWidth,
    viewportWidth: element.parentElement!.clientWidth,
  }));
  expect(table.contentWidth).toBeGreaterThan(table.viewportWidth);
});

test('queue request errors show retry and loading feedback while a response is pending', async ({ page }) => {
  await signIn(page, agentEmails[4]);
  await page.route('**/api/tickets?*', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Queue temporarily unavailable.' } }),
  }));
  await page.reload();

  await expect(page.getByRole('alert')).toContainText('We could not load tickets');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await page.unroute('**/api/tickets?*');
  await page.route('**/api/tickets?*', async (route) => {
    await page.waitForTimeout(300);
    await route.continue();
  });
  await page.reload();

  await expect(page.getByRole('status')).toContainText('Loading tickets');
  await expect(page.getByText('26 tickets')).toBeVisible();
});
