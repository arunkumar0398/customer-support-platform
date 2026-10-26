import { expect, test } from '@playwright/test';

test('renders the support platform shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Customer Support Platform' })).toBeVisible();
});
