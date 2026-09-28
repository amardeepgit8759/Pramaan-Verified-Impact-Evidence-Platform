import { expect, test } from '@playwright/test';
import { photo, signUp } from './helpers';

const exifDate = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, ':');

test('gap alert → evidence closes it → before/after compare → search', async ({ page }) => {
  await signUp(page);
  const project = await (
    await page.request.post('/api/projects', {
      data: { name: 'Borewell Project', startDate: '2024-01-01' },
    })
  ).json();
  await page.request.post(`/api/projects/${project.id}/sites`, {
    data: { name: 'Village Rampur', lat: 28.47, lng: 77.03, radiusM: 500 },
  });

  // A new site with no evidence is a documentation gap.
  await page.goto(`/app/projects/${project.id}/sites`);
  await expect(page.getByText('Gap: No verified evidence yet')).toBeVisible();

  // An old photo and a fresh one: the fresh one closes the gap, live.
  await page.getByRole('link', { name: 'Evidence', exact: true }).click();
  await page.locator('input[type=file][multiple]').setInputFiles([
    photo('dry-field.jpg', { capturedAt: '2024:02:01 09:00:00', seed: 3 }),
    photo('new-pump.jpg', {
      capturedAt: exifDate(new Date(Date.now() - 2 * 86_400_000)),
      seed: 11,
    }),
  ]);
  const rows = page.getByRole('listitem').filter({ hasText: /dry-field|new-pump/ });
  await expect(rows.getByText('Verified')).toHaveCount(2);
  await page.getByRole('link', { name: 'Sites', exact: true }).click();
  await expect(page.getByText('2 files')).toBeVisible();
  await expect(page.getByText(/Gap: /)).toHaveCount(0);

  // Compare suggests the earliest and latest verified photos, with a CDN-built composite.
  await page.getByRole('link', { name: 'Compare', exact: true }).click();
  await expect(page.getByText(/earliest and latest verified photos/)).toBeVisible();
  await expect(page.getByText(/^Before · .*2024$/)).toBeVisible();
  const slider = page.getByRole('slider');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '51% before');
  const composite = await page
    .getByRole('link', { name: /Side-by-side image/ })
    .getAttribute('href');
  const image = await page.request.get(composite!);
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/');

  // Search finds both by meaning and opens the drawer.
  await page.getByRole('link', { name: 'Search' }).first().click();
  await page.getByRole('searchbox').fill('hand pump');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('2 results, best match first')).toBeVisible();
  await expect(page.getByText(/\d+% match/).first()).toBeVisible();
  await page
    .getByRole('button', { name: /match\. Verified\. Open details/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
