import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('admin sets up a project with a site and a field teammate', async ({ page, browser }) => {
  await signUp(page);

  // Project
  await page.getByRole('button', { name: /New project/ }).click();
  await page.getByLabel('Project name').fill('Borewell Project – Phase 1');
  await page.getByLabel('Start date').fill('2024-01-01');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Borewell Project – Phase 1' }).click();
  await expect(page.getByRole('heading', { name: 'Borewell Project – Phase 1' })).toBeVisible();

  // Site, placed by typing coordinates
  await page.getByRole('link', { name: 'Add a site' }).click();
  await page.getByRole('button', { name: /Add site/ }).click();
  await page.getByLabel('Site name').fill('Village Rampur');
  await page.getByLabel('Latitude').fill('28.47');
  await page.getByLabel('Longitude').fill('77.03');
  await page.getByRole('button', { name: 'Add site' }).click();
  await expect(page.getByRole('heading', { name: 'Village Rampur' })).toBeVisible();
  await expect(page.getByText(/radius 500 m/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Map of project sites' })).toBeVisible();

  // Edit the project's status
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Project name').fill('Borewell Project – Phase 1 (2024)');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('heading', { name: 'Borewell Project – Phase 1 (2024)' }),
  ).toBeVisible();

  // Invite a field teammate from Settings
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page.getByRole('heading', { name: 'Deductions' })).toBeVisible();
  await page.getByRole('button', { name: 'Invite' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Ravi Kumar');
  await page.getByLabel('Email', { exact: true }).fill(`ravi+${randomUUID()}@example.org`);
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const inviteUrl = await page.getByRole('textbox', { name: 'Invite link' }).inputValue();

  // The teammate sets a password and sees the project, without admin controls
  const ravi = await (await browser.newContext()).newPage();
  await ravi.goto(new URL(inviteUrl).pathname + new URL(inviteUrl).search);
  await ravi.getByLabel('New password').fill('ravi password');
  await ravi.getByLabel('Confirm password').fill('ravi password');
  await ravi.getByRole('button', { name: /Set password/ }).click();
  await expect(ravi).toHaveURL('/app', { timeout: 15_000 });
  await ravi.getByRole('link', { name: 'Borewell Project – Phase 1 (2024)', exact: true }).click();
  await expect(ravi.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await ravi.getByRole('link', { name: 'Sites', exact: true }).click();
  await expect(ravi.getByRole('heading', { name: 'Village Rampur' })).toBeVisible();
  await expect(ravi.getByRole('button', { name: /Add site/ })).toHaveCount(0);
});
