import { expect, test } from '@playwright/test';

test('home page shows live system status from the API', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pramaan' })).toBeVisible();
  await expect(page.getByText('Connected')).toBeVisible();
  await expect(page.getByText('Enabled')).toBeVisible();
});

test('unknown pages render the not-found screen', async ({ page }) => {
  await page.goto('/definitely/not/a/page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL('/');
});
