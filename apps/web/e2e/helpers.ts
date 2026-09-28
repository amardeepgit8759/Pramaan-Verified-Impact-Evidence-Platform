import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
// Test-only image generator from the API package: a real JPEG with EXIF.
import { makeJpegWithExif } from '../../api/test/sample-image';

// Password hashing is deliberately slow (scrypt), and every worker signs up at once.
const AUTH_TIMEOUT = 15_000;

/** Sign up a fresh organisation in `page`; returns the admin's email. */
export async function signUp(page: Page, orgName = 'Jal Seva Trust') {
  const email = `admin+${randomUUID()}@example.org`;
  await page.goto('/signup');
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByLabel('Your name').fill('Asha Rao');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page).toHaveURL('/app', { timeout: AUTH_TIMEOUT });
  return email;
}

export async function signIn(page: Page, email: string) {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/app', { timeout: AUTH_TIMEOUT });
}

/** Create a project with one site through the API (the UI flow is covered elsewhere). */
export async function createProjectWithSite(page: Page, name = 'Borewell Project – Phase 1') {
  const project = await (
    await page.request.post('/api/projects', {
      data: { name, startDate: '2024-01-01', endDate: '2024-12-31' },
    })
  ).json();
  await page.request.post(`/api/projects/${project.id}/sites`, {
    data: { name: 'Village Rampur', lat: 28.47, lng: 77.03, radiusM: 500 },
  });
  return project as { id: string; name: string };
}

/** A real JPEG with EXIF, as a file Playwright can hand to an <input type=file>. */
export function photo(
  name: string,
  opts: { lat?: number; lng?: number; capturedAt?: string; seed?: number } = {},
) {
  return {
    name,
    mimeType: 'image/jpeg',
    buffer: makeJpegWithExif({
      lat: opts.lat ?? 28.4702,
      lng: opts.lng ?? 77.0301,
      capturedAt: opts.capturedAt ?? '2024:03:10 09:00:00',
      seed: opts.seed,
    }),
  };
}
