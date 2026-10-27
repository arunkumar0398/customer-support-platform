import { expect, test } from '@playwright/test';

test('routes signed-out visitors to the sign-in shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Support Desk' })).toBeVisible();
});
