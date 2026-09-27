import { expect, test } from '@playwright/test';
import { createProjectWithSite, photo, signIn, signUp } from './helpers';

test('the dashboard updates live when someone uploads elsewhere', async ({ page, browser }) => {
  const email = await signUp(page);
  const project = await createProjectWithSite(page);

  // Context A: the dashboard, left open.
  await page.goto('/app');
  const totalTile = page
    .locator('div', { has: page.locator('dt', { hasText: 'Total evidence' }) })
    .last();
  await expect(totalTile.locator('dd').first()).toHaveText('0');
  await expect(page.getByText('Live', { exact: true }).first()).toBeVisible();

  // Context B: the same organisation uploads a photo from the project's Evidence tab.
  const other = await (await browser.newContext()).newPage();
  await signIn(other, email);
  await other.goto(`/app/projects/${project.id}/evidence`);
  await other.locator('input[type=file][multiple]').setInputFiles(photo('pump.jpg'));
  await expect(other.getByText('Matched to Village Rampur')).toBeVisible();

  // Back in A: no reload, the figures change on their own.
  await expect(totalTile.locator('dd').first()).toHaveText('1', { timeout: 10_000 });
  await expect(page.getByText(/New asset verified in Borewell Project/)).toBeVisible();
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
});
