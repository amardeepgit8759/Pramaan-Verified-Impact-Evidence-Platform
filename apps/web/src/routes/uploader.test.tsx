import type { AssetDetail, ProjectSummary } from '@pramaan/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { adminSession, mockApi, renderRoute, viewerSession } from '@/test-utils';

const project: ProjectSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Borewell Project – Phase 1',
  description: '',
  startDate: '2024-01-01',
  endDate: null,
  sdgGoals: [],
  csrCategory: null,
  status: 'active',
  createdAt: '2024-01-02T00:00:00.000Z',
  siteCount: 1,
  assetCount: 0,
  bands: { verified: 0, review: 0, flagged: 0 },
  averageTrust: null,
};

const asset: AssetDetail = {
  id: '55555555-5555-4555-8555-555555555555',
  projectId: project.id,
  projectName: project.name,
  siteId: '44444444-4444-4444-8444-444444444444',
  siteName: 'Village Rampur',
  uploadedBy: 'Asha Rao',
  resourceType: 'image',
  format: 'jpg',
  width: 1200,
  height: 900,
  bytes: 200_000,
  originalFilename: 'pump',
  secureUrl: 'https://res.cloudinary.com/x/image/upload/pump.jpg',
  thumbnailUrl: 'https://res.cloudinary.com/x/image/upload/c_fill/pump.jpg',
  previewUrl: 'https://res.cloudinary.com/x/image/upload/w_1600/pump.jpg',
  capturedAt: '2024-03-10T09:00:00.000Z',
  uploadedAt: '2024-03-11T09:00:00.000Z',
  lat: 28.47,
  lng: 77.03,
  tags: ['water pump'],
  taggingProvider: 'gemini',
  caption: 'A hand pump.',
  trustScore: 100,
  trustBand: 'verified',
  reviewDecision: null,
  checks: [],
  exif: {},
};

/** Stands in for the browser's direct upload to Cloudinary. */
class FakeXhr {
  static lastForm: FormData | null = null;
  status = 200;
  response: unknown = null;
  responseType = '';
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open() {}
  abort() {}
  send(form: FormData) {
    FakeXhr.lastForm = form;
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
      this.response = { public_id: 'pramaan/org/project/pump', resource_type: 'image' };
      this.onload?.();
    });
  }
}

function setup(session = adminSession, confirm: [number, unknown] = [201, asset]) {
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return mockApi({
    'GET /api/auth/me': [200, session],
    [`GET /api/projects/${project.id}`]: [200, project],
    [`GET /api/projects/${project.id}/sites`]: [200, { sites: [] }],
    [`GET /api/projects/${project.id}/assets`]: [200, { assets: [] }],
    'POST /api/uploads/signature': [
      200,
      {
        uploadUrl: 'https://api.cloudinary.com/v1_1/x/auto/upload',
        params: { signature: 'sig', api_key: 'key', timestamp: '1', folder: 'pramaan/org/project' },
      },
    ],
    'POST /api/assets/confirm': confirm,
  });
}

const photo = () => new File(['jpeg bytes'], 'pump.jpg', { type: 'image/jpeg' });

describe('evidence uploader', () => {
  it('signs, uploads straight to Cloudinary, verifies and reveals the score', async () => {
    const { calls } = setup();
    renderRoute(`/app/projects/${project.id}/evidence`);
    const zone = (await screen.findByText('Drop photos or videos here')).closest(
      'div',
    )!.parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: [photo()] } });

    const row = (await screen.findByText('Matched to Village Rampur')).closest('li')!;
    expect(within(row).getByText('100')).toBeVisible();
    expect(within(row).getByText('Verified')).toBeVisible();

    // The browser sends the file with the server's signed params, untouched.
    expect(FakeXhr.lastForm?.get('signature')).toBe('sig');
    expect(FakeXhr.lastForm?.get('folder')).toBe('pramaan/org/project');
    expect(calls.find((c) => c.key === 'POST /api/assets/confirm')?.body).toEqual({
      publicId: 'pramaan/org/project/pump',
      projectId: project.id,
      siteId: null,
      resourceType: 'image',
    });
  });

  it('shows why a file failed and lets you retry it', async () => {
    setup(adminSession, [400, { error: 'This upload doesn’t belong to this project' }]);
    renderRoute(`/app/projects/${project.id}/evidence`);
    const zone = (await screen.findByText('Drop photos or videos here')).closest(
      'div',
    )!.parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: [photo()] } });
    expect(await screen.findByText('This upload doesn’t belong to this project')).toBeVisible();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeVisible();
  });

  it('isn’t offered to viewers', async () => {
    setup(viewerSession);
    renderRoute(`/app/projects/${project.id}/evidence`);
    expect(await screen.findByText('No evidence yet')).toBeVisible();
    expect(screen.queryByText('Drop photos or videos here')).toBeNull();
  });
});
