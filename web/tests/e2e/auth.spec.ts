import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { PrismaClient } from '../../../api/src/generated/prisma/client.js';
import { seedDatabase } from '../../../api/prisma/seed.js';
import { assertActualTestDatabase, assertSafeTestDatabaseUrl } from '../../../scripts/database-identity.mjs';
import { captureCheckpointScreenshot } from './capture-checkpoint-screenshot.js';

test.describe.configure({ mode: 'serial' });

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const testUrl = process.env.TEST_DATABASE_URL;
const verifier = new Client({ connectionString: testUrl, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 2 }) });
const userId = randomUUID();
const organizationId = randomUUID();
const email = `browser-${userId}@example.test`;
const password = 'synthetic-browser-fixture-password';
let verified = false;

test.beforeAll(async () => {
  expect(testUrl, 'TEST_DATABASE_URL is required for browser fixtures').toBeTruthy();
  const expected = assertSafeTestDatabaseUrl(testUrl!);
  await verifier.connect();
  const identity = await verifier.query('SELECT current_database() AS database, current_user AS username');
  assertActualTestDatabase(identity.rows[0], expected);
  verified = true;
  await seedDatabase(verifier);

  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
  await db.organization.create({
    data: { id: organizationId, slug: `browser-${organizationId}`, name: 'Browser auth fixture' },
  });
  await db.user.create({
    data: {
      id: userId,
      email,
      passwordHash,
      memberships: { create: { organizationId, role: 'ADMIN' } },
    },
  });
});

test.afterAll(async () => {
  if (verified) {
    await db.session.deleteMany({ where: { userId } });
    await db.membership.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  await db.$disconnect();
  await verifier.end();
});

test('redirects unauthenticated visits to the sign-in page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Support Desk' })).toBeVisible();
  await captureCheckpointScreenshot(page, '01-sign-in-desktop.png');
});

test('keeps the sign-in page within narrow tablet viewport bounds', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/sign-in');

  const story = await page.locator('.auth-story').boundingBox();
  const panel = await page.locator('.auth-panel').boundingBox();
  expect(story).not.toBeNull();
  expect(panel).not.toBeNull();
  expect(panel!.y).toBeGreaterThanOrEqual(story!.y + story!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.keyboard.press('Tab');
  const email = page.getByLabel('Email');
  await expect(email).toBeFocused();
  await expect.poll(() => email.evaluate((input) => getComputedStyle(input).boxShadow)).not.toBe('none');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
  await captureCheckpointScreenshot(page, '02-sign-in-mobile.png');
});

test('sign-in copy meets WCAG AA and fits the supported viewport widths', async ({ page }) => {
  const widths = [320, 375, 1280, 1440, 1920];
  const measured = [];
  const renderDirectory = process.env.HALLMARK_RENDER_DIR;
  if (renderDirectory) mkdirSync(renderDirectory, { recursive: true });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in to Support Desk' })).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
    const result = await page.evaluate(() => {
      const rgb = (value: string) => {
        const match = value.match(/[\d.]+/g)?.map(Number);
        if (!match || match.length < 3) return null;
        return match.slice(0, 3).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
      };
      const ratio = (foreground: string, background: string) => {
        const fg = rgb(foreground);
        const bg = rgb(background);
        if (!fg || !bg) return 0;
        const luminance = (channels: number[]) => 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
        return (values[0] + 0.05) / (values[1] + 0.05);
      };
      const opaqueBackground = (element: Element) => {
        let current: Element | null = element;
        while (current) {
          const color = getComputedStyle(current).backgroundColor;
          if (!color.includes('rgba') || Number(color.match(/,\s*([\d.]+)\s*\)/)?.[1] ?? '1') > 0) return color;
          current = current.parentElement;
        }
        return getComputedStyle(document.documentElement).backgroundColor;
      };
      const targets = ['.story-footer', '.panel-eyebrow', '.privacy-note'];
      const contrasts = targets.map((selector) => {
        const element = document.querySelector(selector)!;
        const style = getComputedStyle(element);
        const background = opaqueBackground(element);
        return { selector, foreground: style.color, background, ratio: Number(ratio(style.color, background).toFixed(2)) };
      });
      const signIn = document.querySelector('.sign-in-button')!;
      const focusStyle = getComputedStyle(signIn);
      const panelColor = getComputedStyle(document.querySelector('.auth-panel')!).backgroundColor;
      return {
        contrasts,
        focusRing: { color: focusStyle.outlineColor, width: focusStyle.outlineWidth, surface: panelColor, ratio: Number(ratio(focusStyle.outlineColor, panelColor).toFixed(2)) },
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      };
    });
    measured.push(result);
    expect(result.documentWidth, `document overflow at ${width}px`).toBeLessThanOrEqual(width);
    expect(result.bodyWidth, `body overflow at ${width}px`).toBeLessThanOrEqual(width);
    expect(result.focusRing.ratio, `sign-in focus ring contrast at ${width}px`).toBeGreaterThanOrEqual(3);
    for (const contrast of result.contrasts) {
      expect(contrast.ratio, `${contrast.selector} contrast at ${width}px (${contrast.foreground} on ${contrast.background})`).toBeGreaterThanOrEqual(4.5);
    }
    if (renderDirectory) {
      await page.screenshot({ path: join(renderDirectory, `sign-in-${width}.png`), fullPage: false });
      if (width === 1440) await page.screenshot({ path: join(renderDirectory, 'sign-in-1440-full.png'), fullPage: true });
    }
  }
  if (renderDirectory) writeFileSync(join(renderDirectory, 'computed-measurements.json'), `${JSON.stringify(measured, null, 2)}\n`);
  console.info(`SIGN_IN_RENDER_MEASUREMENTS ${JSON.stringify(measured)}`);
});

test('keyboard focus is visible on every sign-in control', async ({ page }) => {
  for (const width of [320, 375, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in to Support Desk' })).toBeVisible();
    const expected = [page.getByLabel('Email'), page.getByLabel('Password'), page.getByRole('button', { name: 'Sign in' })];
    await page.keyboard.press('Tab');
    const visibleFocus = [];
    for (const control of expected) {
      await expect(control).toBeFocused();
      const focus = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, boxShadow: style.boxShadow };
      });
      expect(focus.outlineStyle !== 'none' && Number.parseFloat(focus.outlineWidth) >= 2, `visible keyboard outline at ${width}px`).toBe(true);
      visibleFocus.push({ name: await control.getAttribute('aria-label') ?? await control.getAttribute('id') ?? 'Sign in', ...focus });
      await page.keyboard.press('Tab');
    }
    console.info(`SIGN_IN_KEYBOARD_FOCUS ${width}px ${JSON.stringify(visibleFocus)}`);
  }
});

test('shows session restoration loading state on mobile and desktop', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await page.waitForTimeout(200);
    await route.continue();
  });
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/sign-in');
    await expect(page.getByText('Restoring your secure session…')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in to Support Desk' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('recovers from a sign-in service failure on mobile and desktop', async ({ page }) => {
  let failOnce = true;
  await page.route('**/api/auth/login', async (route) => {
    if (failOnce && route.request().method() === 'POST') {
      failOnce = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Login service temporarily unavailable.' } }),
      });
      return;
    }
    await route.continue();
  });
  for (const width of [375, 1280]) {
    failOnce = true;
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in to Support Desk' })).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    if (failOnce) throw new Error('The controlled first login request did not fail.');
    await expect(page.getByRole('alert')).toContainText('Login service temporarily unavailable.');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Ticket queue' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/sign-in');
  }
});

test('shows invalid credentials without creating an authenticated session', async ({ page }) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in to Support Desk' })).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('incorrect-browser-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');
    await expect(page.getByRole('heading', { name: 'Your support workspace' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('restores a real server session after reload and signs out', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('admin.alpha@example.test');
  await page.getByLabel('Password').fill('SupportDemo-Only-2026!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Ticket queue' })).toBeVisible();
  await expect(page.getByText('admin.alpha@example.test')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ticket queue' })).toBeVisible();
  await expect(page.getByText('admin.alpha@example.test')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});
