import { expect, test } from '@playwright/test';
import { photo, signUp } from './helpers';

test('generate a cited report, export it, and share the project with a funder', async ({
  page,
  browser,
}) => {
  await signUp(page);
  const project = await (
    await page.request.post('/api/projects', {
      data: { name: 'Borewell Project', startDate: '2024-01-01', sdgGoals: [6] },
    })
  ).json();
  await page.request.post(`/api/projects/${project.id}/sites`, {
    data: { name: 'Village Rampur', lat: 28.47, lng: 77.03, radiusM: 500 },
  });

  await page.goto(`/app/projects/${project.id}/evidence`);
  await page
    .locator('input[type=file][multiple]')
    .setInputFiles([
      photo('dry-field.jpg', { capturedAt: '2024:02:01 09:00:00', seed: 3 }),
      photo('new-pump.jpg', { capturedAt: '2024:06:01 09:00:00', seed: 11 }),
    ]);
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: /dry-field|new-pump/ })
      .getByText('Verified'),
  ).toHaveCount(2);

  // Generate: the report is written in the background and flips to Ready live.
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.getByText('No reports yet')).toBeVisible();
  await page.getByRole('button', { name: /Generate report/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByText('Ready')).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(/2 cited statements · 2 evidence files · 1 uncited removed/),
  ).toBeVisible();

  // Every sentence opens the photos it cites.
  await page.getByRole('link', { name: 'Read report' }).click();
  await page
    .getByRole('button', { name: /2 verified evidence files were captured at Village Rampur/ })
    .click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByText('Statement 1 cites 2 evidence files.')).toBeVisible();
  // 2024 photos uploaded today lose 10 for a late upload: both score 90.
  await expect(panel.getByText('Trust Score 90')).toHaveCount(2);
  await page.keyboard.press('Escape');

  // Exports.
  const pdfHref = await page.getByRole('link', { name: /Download PDF/ }).getAttribute('href');
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  const csvHref = await page
    .getByRole('link', { name: /Evidence annex \(CSV\)/ })
    .getAttribute('href');
  const csv = await (await page.request.get(csvHref!)).text();
  expect(csv.split('\n')[0]).toContain('evidence_ref,asset_id,url');

  // Share with a funder who has no account.
  await page.getByRole('link', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: /Create link/ }).click();
  const url = await page.getByText(/\/share\/[A-Za-z0-9_-]{32}$/).textContent();
  const funder = await (await browser.newContext()).newPage();
  await funder.goto(new URL(url!).pathname);
  await expect(funder.getByRole('heading', { level: 1, name: 'Borewell Project' })).toBeVisible();
  await expect(funder.getByText('Verified evidence files', { exact: true })).toBeVisible();
  await funder.getByRole('link', { name: 'Read report' }).click();
  await expect(funder.getByRole('heading', { name: 'Evidence by site' })).toBeVisible();

  // Revoking takes effect immediately.
  await page.getByRole('button', { name: 'Revoke link' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke link' }).click();
  await expect(page.getByText('No funder links yet')).toBeVisible();
  await funder.goto(new URL(url!).pathname);
  await expect(funder.getByText('This link doesn’t work')).toBeVisible();
});
