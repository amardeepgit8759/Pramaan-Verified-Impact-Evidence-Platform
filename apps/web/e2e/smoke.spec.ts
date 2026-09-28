import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('landing page leads to sign-up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Proof, not promises/ })).toBeVisible();
  await page.getByRole('link', { name: /Start verifying evidence/ }).click();
  await expect(page).toHaveURL('/signup');
});

test('an admin signs up, creates a project, signs out and back in', async ({ page }) => {
  const email = `admin+${randomUUID()}@example.org`;

  await page.goto('/signup');
  await page.getByLabel('Organisation name').fill('Jal Seva Trust');
  await page.getByLabel('Your name').fill('Asha Rao');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create organisation' }).click();

  await expect(page).toHaveURL('/app', { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /Asha/ })).toBeVisible();
  await expect(page.getByText('Create your first project')).toBeVisible();

  await page.getByRole('button', { name: /New project/ }).click();
  await page.getByLabel('Project name').fill('Borewell Project – Phase 1');
  await page.getByLabel('Start date').fill('2024-01-01');
  await page.getByRole('button', { name: /Clean Water and Sanitation/ }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'Borewell Project – Phase 1' })).toBeVisible();

  await page
    .getByRole('button', { name: /Asha Rao|Account menu/ })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/app/projects');
  await expect(page).toHaveURL(/\/signin\?next=/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/app/projects');
  await expect(page.getByRole('heading', { name: 'Borewell Project – Phase 1' })).toBeVisible();
});

test('unknown pages render the not-found screen', async ({ page }) => {
  await page.goto('/definitely/not/a/page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL('/');
});
