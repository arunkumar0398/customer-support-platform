import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
const hallmarkEvidenceDirectory = resolve(process.cwd(), 'evidence/reviews/hallmark-2026-10-31');
mkdirSync(hallmarkEvidenceDirectory, { recursive: true });

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
  const adminRow = page.getByRole('row', { name: new RegExp(emails.admin) });
  await expect(adminRow.getByRole('button', { name: `Save ${emails.admin}` })).toHaveText('Save');
  await expect(adminRow.getByRole('button', { name: `Deactivate ${emails.admin}` })).toHaveText('Deactivate');
  await expect(page.getByText('Scroll horizontally to see roles, access, and actions')).toBeHidden();
  await captureCheckpointScreenshot(page, '11-memberships-desktop.png');
  await page.screenshot({ path: join(hallmarkEvidenceDirectory, 'memberships-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByText('Scroll horizontally to see roles, access, and actions')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.locator('.members-table-wrap')).toBeHidden();
  const mobileRoster = page.getByRole('region', { name: 'Mobile member roster' });
  await expect(mobileRoster).toBeVisible();
  await expect(mobileRoster.getByRole('listitem')).toHaveCount(2);
  await expect(mobileRoster.getByText(emails.admin, { exact: true })).toBeVisible();
  await expect(mobileRoster.getByText(emails.agent, { exact: true })).toBeVisible();
  await expect(mobileRoster.getByRole('button', { name: `Save ${emails.admin}` })).toBeDisabled();
  const memberEmail = mobileRoster.getByText(emails.agent, { exact: true });
  expect(Number.parseFloat(await memberEmail.evaluate((element) => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
  const currentRole = mobileRoster.getByText('Current role: Agent', { exact: true });
  expect(Number.parseFloat(await currentRole.evaluate((element) => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
  for (const width of [320, 375, 768, 900, 901, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `document width at ${width}px`).toBeLessThanOrEqual(width);
    if (width <= 900) {
      await expect(page.getByRole('region', { name: 'Mobile member roster' })).toBeVisible();
      await expect(page.locator('.members-table-wrap')).toBeHidden();
    } else {
      await expect(page.getByRole('region', { name: 'Mobile member roster' })).toBeHidden();
      await expect(page.locator('.members-table-wrap')).toBeVisible();
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await captureCheckpointScreenshot(page, '12-memberships-mobile.png');
  await page.screenshot({ path: join(hallmarkEvidenceDirectory, 'memberships-mobile.png'), fullPage: true });
  const agentCard = mobileRoster.getByRole('listitem').filter({ hasText: emails.agent });
  const roleSelect = agentCard.getByLabel(`Role for ${emails.agent}`);
  await roleSelect.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  expect(await roleSelect.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  expect(await roleSelect.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  expect(Number.parseFloat(await roleSelect.evaluate((element) => getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: join(hallmarkEvidenceDirectory, 'memberships-keyboard-focus.png'), fullPage: true });
  await roleSelect.selectOption('CUSTOMER');
  await agentCard.getByRole('button', { name: `Save ${emails.agent}` }).click();
  await expect(agentCard).toContainText('Current role: Customer');
  await expect.poll(() => db.membership.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId, userId: agentId } },
  })).toMatchObject({ role: 'CUSTOMER', isActive: true });
  await agentCard.getByRole('button', { name: `Deactivate ${emails.agent}` }).click();
  await expect(agentCard).toContainText('Inactive');
  await agentCard.getByRole('button', { name: `Reactivate ${emails.agent}` }).click();
  await expect(agentCard).toContainText('Active');
  await agentCard.getByLabel(`Role for ${emails.agent}`).selectOption('AGENT');
  await agentCard.getByRole('button', { name: `Save ${emails.agent}` }).click();
  await expect(agentCard).toContainText('Current role: Agent');
  await page.setViewportSize({ width: 1280, height: 720 });

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
