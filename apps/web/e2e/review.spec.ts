import { expect, test } from '@playwright/test';
import { createProjectWithSite, photo, signUp } from './helpers';

test('upload → flagged → review → approved', async ({ page }) => {
  await signUp(page);
  const phase1 = await createProjectWithSite(page, 'Borewell Project – Phase 1');
  const phase2 = await createProjectWithSite(page, 'Borewell Project – Phase 2');
  const pump = photo('pump.jpg', { seed: 7 });

  // The original goes into Phase 1 and verifies.
  await page.goto(`/app/projects/${phase1.id}/evidence`);
  await page.locator('input[type=file][multiple]').setInputFiles(pump);
  const firstRow = page.getByRole('listitem').filter({ hasText: 'pump.jpg' });
  await expect(firstRow.getByText('Verified')).toBeVisible();

  // The same file reused for Phase 2 is flagged as an exact copy.
  await page.goto(`/app/projects/${phase2.id}/evidence`);
  await page.locator('input[type=file][multiple]').setInputFiles(pump);
  const copyRow = page.getByRole('listitem').filter({ hasText: 'pump.jpg' });
  await expect(copyRow.getByText('Flagged')).toBeVisible();

  // It waits in Phase 2's review queue with the reason spelled out.
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(
    page.getByText('Exact copy of an asset in Borewell Project – Phase 1'),
  ).toBeVisible();

  // A note is required.
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Add a short note explaining the decision')).toBeVisible();
  await page
    .getByLabel('Review note')
    .fill('Same borewell documented for both phases; confirmed on site.');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Nothing to review')).toBeVisible();

  // The decision is on the record, and the score is unchanged: 100 − 60 (exact copy)
  // − 10 (a 2024 photo uploaded today is a late upload) = 30.
  await page.getByRole('link', { name: 'Evidence', exact: true }).click();
  await page.getByRole('button', { name: /Flagged, score 30\. Open details/ }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Approved by admin')).toBeVisible();
  await expect(drawer.getByText(/Asha Rao approved at score 30/)).toBeVisible();
  await expect(drawer.getByRole('img', { name: 'Trust Score 30 of 100: Flagged' })).toBeVisible();
});
