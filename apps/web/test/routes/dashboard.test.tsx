import type { Metrics, ProjectSummary } from '@pramaan/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { render } from '@testing-library/react';
import { Toaster } from 'sonner';
import { describe, expect, it } from 'vitest';
import { FakeEventSource } from '../setup';
import { adminSession, mockApi, renderRoute } from '../utils';

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
  assetCount: 3,
  bands: { verified: 2, review: 1, flagged: 0 },
  averageTrust: 88,
};

const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2024, 2, 1 + i));
  return d.toISOString().slice(0, 10);
});

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    totalAssets: 3,
    verifiedPct: 66.7,
    bands: { verified: 2, review: 1, flagged: 0 },
    averageTrust: 88,
    flaggedLast7Days: 0,
    needsReview: 1,
    uploadsPerDay: days.map((date, i) => ({ date, count: i === 29 ? 3 : 0 })),
    bandsOverTime: days.map((date) => ({ date, verified: 0, review: 0, flagged: 0 })),
    assetsPerSite: [],
    gapSites: [
      {
        siteId: '44444444-4444-4444-8444-444444444444',
        siteName: 'Kheda Dhani',
        projectId: project.id,
        projectName: project.name,
        daysSinceVerified: null,
        reason: 'No verified evidence yet',
      },
    ],
    reportsGenerated: 0,
    ...overrides,
  };
}

describe('dashboard', () => {
  it('shows live KPIs, charts, gaps and the review queue from the API', async () => {
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/projects': [200, { projects: [project] }],
      'GET /api/metrics': [200, metrics()],
      'GET /api/events': [200, { events: [] }],
      'GET /api/review-queue': [200, { assets: [] }],
    });
    renderRoute('/app');
    const total = (await screen.findByText('Total evidence')).closest('div')!;
    expect(await within(total).findByText('3')).toBeVisible();
    const verified = screen.getByText('Verified', { selector: 'dt' }).closest('div')!;
    expect(within(verified).getByText('67%')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Uploads per day' })).toBeVisible();
    const bands = screen.getByRole('heading', { name: 'Trust bands' }).closest('section')!;
    // Charts load after the numbers.
    expect(
      await within(bands).findByRole('img', { name: '2 verified, 1 needs review, 0 flagged' }),
    ).toBeVisible();
    expect(screen.getByText('Kheda Dhani')).toBeVisible();
    expect(screen.getByText(/Nothing waiting/)).toBeVisible();
    // Every chart has a table twin.
    await waitFor(() => expect(screen.getAllByText('Show as table')).toHaveLength(2));
  });

  it('refreshes figures when a live event arrives, and toasts other people’s flags', async () => {
    let current = metrics();
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/projects': [200, { projects: [project] }],
      'GET /api/metrics': () => [200, current],
      'GET /api/events': [200, { events: [] }],
      'GET /api/review-queue': [200, { assets: [] }],
    });
    render(<Toaster />);
    renderRoute('/app');
    const total = (await screen.findByText('Total evidence')).closest('div')!;
    await within(total).findByText('3');

    current = metrics({ totalAssets: 4, bands: { verified: 2, review: 1, flagged: 1 } });
    act(() => {
      FakeEventSource.emit('asset.created', {
        id: 7,
        type: 'asset.created',
        createdAt: new Date().toISOString(),
        payload: {
          projectId: project.id,
          projectName: project.name,
          band: 'flagged',
          actorId: 'someone-else',
        },
      });
    });

    await waitFor(() => expect(within(total).getByText('4')).toBeVisible());
    expect(
      await screen.findByText('New asset flagged in Borewell Project – Phase 1'),
    ).toBeVisible();
  });

  it('doesn’t toast your own uploads', async () => {
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/projects': [200, { projects: [project] }],
      'GET /api/metrics': [200, metrics()],
      'GET /api/events': [200, { events: [] }],
      'GET /api/review-queue': [200, { assets: [] }],
    });
    render(<Toaster />);
    renderRoute('/app');
    await screen.findByText('Total evidence');
    act(() => {
      FakeEventSource.emit('asset.created', {
        id: 8,
        type: 'asset.created',
        createdAt: new Date().toISOString(),
        payload: { projectName: 'My own project', band: 'flagged', actorId: adminSession.user.id },
      });
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('New asset flagged in My own project')).toBeNull();
  });
});
