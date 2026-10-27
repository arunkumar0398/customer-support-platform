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
const otherOrganizationId = randomUUID();
const adminId = randomUUID();
const agentId = randomUUID();
const otherOrgUserId = randomUUID();
const emails = {
  admin: `membership-ui-admin-${adminId}@example.test`,
  agent: `membership-ui-agent-${agentId}@example.test`,
  otherOrgUser: `membership-ui-existing-${otherOrgUserId}@example.test`,
};
const password = 'synthetic-membership-ui-fixture-password';
let verified = false;

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test.beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required for membership browser fixtures').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;

  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.organization.createMany({ data: [
    { id: organizationId, slug: `membership-ui-${organizationId}`, name: 'Membership UI fixture' },
    { id: otherOrganizationId, slug: `membership-ui-other-${otherOrganizationId}`, name: 'Other membership fixture' },
  ] });
  await db.user.createMany({ data: [
    { id: adminId, email: emails.admin, passwordHash },
    { id: agentId, email: emails.agent, passwordHash },
    { id: otherOrgUserId, email: emails.otherOrgUser, passwordHash },
  ] });
  await db.membership.createMany({ data: [
    { organizationId, userId: adminId, role: 'ADMIN' },
    { organizationId, userId: agentId, role: 'AGENT' },
    { organizationId: otherOrganizationId, userId: otherOrgUserId, role: 'ADMIN' },
  ] });
});
test.afterAll(async () => {
  if (verified) {
    await db.session.deleteMany({ where: { userId: { in: [adminId, agentId, otherOrgUserId] } } });
    await db.membership.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, agentId, otherOrgUserId] } } });
    await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
  }
  await db.$disconnect();
  await verifier.end();
});

test('admin can add an existing account and update its organization role and activation', async ({ page }) => {
  await signIn(page, emails.admin);
  await expect(page.getByRole('link', { name: 'Members', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Members', exact: true }).click();
  await expect(page).toHaveURL('/admin/members');
  await expect(page.getByRole('heading', { name: 'Organization members' })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(emails.admin) })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(emails.agent) })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(emails.otherOrgUser) })).toHaveCount(0);

  await page.getByLabel('Existing account email').fill(emails.otherOrgUser);
  await page.getByLabel('New member role').selectOption('AGENT');
  await page.getByRole('button', { name: 'Add member' }).click();
  const addedRow = page.getByRole('row', { name: new RegExp(emails.otherOrgUser) });
  await expect(addedRow).toContainText('Agent');
  await expect(addedRow).toContainText('Active');
  await expect.poll(() => db.membership.count({ where: { organizationId, userId: otherOrgUserId } })).toBe(1);
  await expect.poll(() => db.membership.count({ where: { organizationId: otherOrganizationId, userId: otherOrgUserId } })).toBe(1);

  await addedRow.getByLabel(`Role for ${emails.otherOrgUser}`).selectOption('CUSTOMER');
  await addedRow.getByRole('button', { name: `Save ${emails.otherOrgUser}` }).click();
  await expect(addedRow).toContainText('Customer');
  await expect.poll(() => db.membership.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId, userId: otherOrgUserId } },
  })).toMatchObject({ role: 'CUSTOMER', isActive: true });

  await addedRow.getByRole('button', { name: `Deactivate ${emails.otherOrgUser}` }).click();
  await expect(addedRow).toContainText('Inactive');
  await addedRow.getByRole('button', { name: `Reactivate ${emails.otherOrgUser}` }).click();
  await expect(addedRow).toContainText('Active');

  await db.membership.update({
    where: { organizationId_userId: { organizationId, userId: agentId } },
    data: { role: 'CUSTOMER' },
  });
  await addedRow.getByLabel(`Role for ${emails.otherOrgUser}`).selectOption('ADMIN');
  await db.membership.update({
    where: { organizationId_userId: { organizationId, userId: otherOrgUserId } },
    data: { role: 'AGENT' },
  });
  await addedRow.getByRole('button', { name: `Deactivate ${emails.otherOrgUser}` }).click();
  await expect(addedRow.locator('td').nth(0)).toHaveText('Agent');
  await expect(addedRow.getByLabel(`Role for ${emails.otherOrgUser}`)).toHaveValue('ADMIN');
  await expect(addedRow.getByRole('button', { name: `Save ${emails.otherOrgUser}` })).toBeEnabled();
  const agentRow = page.getByRole('row', { name: new RegExp(emails.agent) });
  await expect(agentRow.locator('td').nth(0)).toHaveText('Customer');
  await expect(agentRow.getByLabel(`Role for ${emails.agent}`)).toHaveValue('CUSTOMER');
  await expect(agentRow.getByRole('button', { name: `Save ${emails.agent}` })).toBeDisabled();
  await addedRow.getByRole('button', { name: `Reactivate ${emails.otherOrgUser}` }).click();

  const adminRow = page.getByRole('row', { name: new RegExp(emails.admin) });
  await adminRow.getByLabel(`Role for ${emails.admin}`).selectOption('AGENT');
  await adminRow.getByRole('button', { name: `Save ${emails.admin}` }).click();
  await expect(page.getByRole('alert')).toContainText('An active administrator must remain.');
  await expect(adminRow).toContainText('Admin');
  await expect(adminRow).toContainText('Active');
  await adminRow.getByRole('button', { name: `Deactivate ${emails.admin}` }).click();
  await expect(page.getByRole('alert')).toContainText('An active administrator must remain.');
  await expect(adminRow).toContainText('Active');
  await expect.poll(() => db.membership.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId, userId: adminId } },
  })).toMatchObject({ role: 'ADMIN', isActive: true });
});
