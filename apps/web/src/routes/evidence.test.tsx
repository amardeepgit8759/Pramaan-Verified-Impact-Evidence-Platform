import type { AssetDetail, ProjectSummary } from '@pramaan/shared';
import { DEFAULT_ORG_SETTINGS } from '@pramaan/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { groupByMonthAndSite } from '@/lib/timeline';
import { adminSession, mockApi, renderRoute, viewerSession } from '@/test-utils';

const project: ProjectSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Borewell Project – Phase 2',
  description: '',
  startDate: '2024-01-01',
  endDate: null,
  sdgGoals: [],
  csrCategory: null,
  status: 'active',
  createdAt: '2024-01-02T00:00:00.000Z',
  siteCount: 1,
  assetCount: 1,
  bands: { verified: 0, review: 0, flagged: 1 },
  averageTrust: 40,
};

const asset: AssetDetail = {
  id: '55555555-5555-4555-8555-555555555555',
  projectId: project.id,
  projectName: project.name,
  siteId: null,
  siteName: 'Village Rampur',
  uploadedBy: 'Ravi Kumar',
  resourceType: 'image',
  format: 'jpg',
  width: 1600,
  height: 1200,
  bytes: 200_000,
  originalFilename: 'pump-copy',
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
  trustScore: 40,
  trustBand: 'flagged',
  reviewDecision: null,
  checks: [
    {
      type: 'exact_duplicate',
      passed: false,
      deduction: 60,
      reason: 'Exact copy of an asset in Borewell Project – Phase 1',
      detail: {},
    },
  ],
  exif: { DateTimeOriginal: '2024:03:10 09:00:00' },
  reviews: [],
  matches: {},
};

function api(session = adminSession) {
  return mockApi({
    'GET /api/auth/me': [200, session],
    [`GET /api/projects/${project.id}`]: [200, project],
    [`GET /api/projects/${project.id}/sites`]: [200, { sites: [] }],
    [`GET /api/projects/${project.id}/assets`]: [200, { assets: [asset] }],
    [`GET /api/assets/${asset.id}`]: [200, asset],
    'GET /api/settings': [
      200,
      { settings: DEFAULT_ORG_SETTINGS, updatedAt: '2024-01-01T00:00:00Z' },
    ],
    'GET /api/review-queue': [200, { assets: [asset] }],
    [`POST /api/assets/${asset.id}/review`]: (body) => [
      200,
      {
        ...asset,
        reviewDecision: (body as { decision: string }).decision,
        reviews: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            decision: (body as { decision: string }).decision,
            note: (body as { note: string }).note,
            reviewerName: 'Asha Rao',
            trustScoreAtReview: 40,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
  });
}

describe('evidence and the detail drawer', () => {
  it('opens a card’s full Trust breakdown, metadata and provider in a drawer', async () => {
    api();
    const { router } = renderRoute(`/app/projects/${project.id}/evidence`);
    await userEvent.click(
      await screen.findByRole('button', { name: /A hand pump\. Flagged, score 40/ }),
    );

    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByRole('img', { name: 'Trust Score 40 of 100: Flagged' }),
    ).toBeVisible();
    expect(
      within(drawer).getByText('Exact copy of an asset in Borewell Project – Phase 1'),
    ).toBeVisible();
    expect(within(drawer).getByText('Tagged by: Gemini vision')).toBeVisible();
    expect(within(drawer).getByText('DateTimeOriginal')).toBeVisible();
    // The drawer is part of the URL, so it can be shared.
    expect(router.state.location.search).toBe(`?asset=${asset.id}`);
  });

  it('lets an admin approve from the Review tab with a required note', async () => {
    const { calls } = api();
    renderRoute(`/app/projects/${project.id}/review`);
    await screen.findByText('1 waiting, oldest first.', { exact: false });

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Add a short note explaining the decision')).toBeVisible();
    expect(calls.some((c) => c.key.startsWith('POST'))).toBe(false);

    await userEvent.type(screen.getByLabelText('Review note'), 'Confirmed with site coordinator');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === `POST /api/assets/${asset.id}/review`)?.body).toEqual({
        decision: 'approve',
        note: 'Confirmed with site coordinator',
      }),
    );
  });

  it('shows viewers the queue without review controls', async () => {
    api(viewerSession);
    renderRoute(`/app/projects/${project.id}/review`);
    expect(await screen.findByText(/Only admins can approve or reject/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});

describe('groupByMonthAndSite', () => {
  it('groups newest month first, then by site, using upload time when there is no capture date', () => {
    const a = (
      id: string,
      capturedAt: string | null,
      uploadedAt: string,
      siteName: string | null,
    ) => ({
      ...asset,
      id,
      capturedAt,
      uploadedAt,
      siteName,
    });
    const groups = groupByMonthAndSite([
      a('1', '2024-03-10T00:00:00Z', '2024-03-11T00:00:00Z', 'Rampur'),
      a('2', null, '2024-04-02T00:00:00Z', null),
      a('3', '2024-03-20T00:00:00Z', '2024-03-21T00:00:00Z', 'Kheda'),
      a('4', '2024-03-05T00:00:00Z', '2024-03-06T00:00:00Z', 'Rampur'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2024-04', '2024-03']);
    expect(groups[1]!.sites.map((s) => [s.name, s.assets.map((x) => x.id)])).toEqual([
      ['Kheda', ['3']],
      ['Rampur', ['1', '4']],
    ]);
    expect(groups[0]!.sites[0]!.name).toBe('No site');
  });
});
