import type { Asset, CompareResponse, Metrics, ProjectSummary, Site } from '@pramaan/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CompareSlider } from '@/components/compare-slider';
import { adminSession, mockApi, renderRoute } from '@/test-utils';

const project: ProjectSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Borewell Project',
  description: '',
  startDate: '2024-01-01',
  endDate: null,
  sdgGoals: [],
  csrCategory: null,
  status: 'active',
  createdAt: '2024-01-02T00:00:00.000Z',
  siteCount: 2,
  assetCount: 2,
  bands: { verified: 2, review: 0, flagged: 0 },
  averageTrust: 100,
};

const asset = (id: string, overrides: Partial<Asset> = {}): Asset => ({
  id,
  projectId: project.id,
  projectName: project.name,
  siteId: '44444444-4444-4444-8444-444444444444',
  siteName: 'Village Rampur',
  uploadedBy: 'Asha Rao',
  resourceType: 'image',
  format: 'jpg',
  width: 1600,
  height: 1200,
  bytes: 1000,
  originalFilename: id,
  secureUrl: `https://res.cloudinary.com/x/image/upload/${id}.jpg`,
  thumbnailUrl: `https://res.cloudinary.com/x/image/upload/c_fill/${id}.jpg`,
  previewUrl: `https://res.cloudinary.com/x/image/upload/w_1600/${id}.jpg`,
  capturedAt: '2024-03-10T09:00:00.000Z',
  uploadedAt: '2024-03-11T09:00:00.000Z',
  lat: 28.47,
  lng: 77.03,
  tags: ['water pump'],
  taggingProvider: 'gemini',
  caption: 'A hand pump',
  trustScore: 100,
  trustBand: 'verified',
  reviewDecision: null,
  ...overrides,
});

const PUMP_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_ID = '66666666-6666-4666-8666-666666666666';

describe('search page', () => {
  it('searches in plain words and shows how well each result matches', async () => {
    const { calls } = mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/projects': [200, { projects: [project] }],
      'GET /api/search/suggestions': [200, { tags: [{ tag: 'water pump', count: 4 }] }],
      'GET /api/search': [
        200,
        {
          mode: 'semantic',
          results: [
            { asset: asset(PUMP_ID), score: 0.91, match: 'semantic' },
            { asset: asset(OTHER_ID, { caption: 'A classroom' }), score: 0.4, match: 'keyword' },
          ],
        },
      ],
    });
    const { router } = renderRoute('/app/search');
    // Example searches come from the organisation's own tags.
    await userEvent.click(await screen.findByRole('button', { name: 'water pump' }));

    expect(await screen.findByText('91% match')).toBeVisible();
    expect(screen.getByText('Keyword match')).toBeVisible();
    expect(router.state.location.search).toBe('?q=water+pump');
    expect(calls.some((c) => c.key === 'GET /api/search')).toBe(true);
  });

  it('says so when it had to fall back to keywords', async () => {
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/projects': [200, { projects: [project] }],
      'GET /api/search/suggestions': [200, { tags: [] }],
      'GET /api/search': [
        200,
        { mode: 'keyword', results: [{ asset: asset(PUMP_ID), score: 1, match: 'keyword' }] },
      ],
    });
    renderRoute('/app/search?q=pump');
    expect(await screen.findByText(/Meaning-based search is unavailable right now/)).toBeVisible();
  });

  it('offers a real empty state for no matches', async () => {
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/projects': [200, { projects: [project] }],
      'GET /api/search/suggestions': [200, { tags: [] }],
      'GET /api/search': [200, { mode: 'semantic', results: [] }],
    });
    renderRoute('/app/search?q=elephant');
    expect(await screen.findByText('Nothing matches “elephant”')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  });
});

describe('CompareSlider', () => {
  it('moves the divider with the keyboard-accessible range input', () => {
    render(
      <CompareSlider
        before={{ src: 'b.jpg', alt: 'Dry field', label: 'Before · 1 Jan 2024' }}
        after={{ src: 'a.jpg', alt: 'New pump', label: 'After · 1 Jun 2024' }}
      />,
    );
    const range = screen.getByRole('slider');
    const beforeImg = screen.getByAltText('Dry field');
    expect(beforeImg).toHaveStyle({ clipPath: 'inset(0 50% 0 0)' });
    fireEvent.change(range, { target: { value: '80' } });
    expect(beforeImg).toHaveStyle({ clipPath: 'inset(0 20% 0 0)' });
    expect(range).toHaveAttribute('aria-valuetext', '80% before');
    expect(screen.getByText('Before · 1 Jan 2024')).toBeVisible();
  });
});

describe('compare tab and gaps', () => {
  const site: Site = {
    id: '44444444-4444-4444-8444-444444444444',
    projectId: project.id,
    name: 'Village Rampur',
    lat: 28.47,
    lng: 77.03,
    radiusM: 500,
    createdAt: '2024-01-01T00:00:00.000Z',
    assetCount: 2,
  };

  it('shows the suggested before/after pair with a downloadable side-by-side', async () => {
    const compare: CompareResponse = {
      candidates: [asset(PUMP_ID), asset(OTHER_ID)],
      before: asset(PUMP_ID, { capturedAt: '2024-01-05T00:00:00.000Z' }),
      after: asset(OTHER_ID, { capturedAt: '2024-06-05T00:00:00.000Z' }),
      compositeUrl: 'https://res.cloudinary.com/x/image/upload/composite.jpg',
      suggested: true,
    };
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      [`GET /api/projects/${project.id}`]: [200, project],
      [`GET /api/projects/${project.id}/sites`]: [200, { sites: [site] }],
      [`GET /api/sites/${site.id}/compare`]: [200, compare],
    });
    renderRoute(`/app/projects/${project.id}/compare`);
    expect(await screen.findByText(/earliest and latest verified photos/)).toBeVisible();
    expect(screen.getByText(/^Before · /)).toBeVisible();
    expect(screen.getByRole('link', { name: /Side-by-side image/ })).toHaveAttribute(
      'href',
      compare.compositeUrl,
    );
  });

  it('marks sites that have a documentation gap', async () => {
    const metrics = {
      gapSites: [
        {
          siteId: site.id,
          siteName: site.name,
          projectId: project.id,
          projectName: project.name,
          daysSinceVerified: 45,
          reason: 'No verified evidence for 45 days',
        },
      ],
    } as Partial<Metrics>;
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      [`GET /api/projects/${project.id}`]: [200, project],
      [`GET /api/projects/${project.id}/sites`]: [200, { sites: [site] }],
      'GET /api/metrics': [
        200,
        {
          totalAssets: 0,
          verifiedPct: null,
          bands: { verified: 0, review: 0, flagged: 0 },
          averageTrust: null,
          flaggedLast7Days: 0,
          needsReview: 0,
          uploadsPerDay: [],
          bandsOverTime: [],
          assetsPerSite: [],
          reportsGenerated: 0,
          ...metrics,
        },
      ],
    });
    renderRoute(`/app/projects/${project.id}/sites`);
    const row = (await screen.findByRole('heading', { name: 'Village Rampur' })).closest('li')!;
    await waitFor(() =>
      expect(within(row).getByText('Gap: No verified evidence for 45 days')).toBeVisible(),
    );
  });
});
