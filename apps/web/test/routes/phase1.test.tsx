import {
  DEFAULT_ORG_SETTINGS,
  type ProjectSummary,
  type RescoreSummary,
  type Site,
} from '@pramaan/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { adminSession, mockApi, renderRoute, viewerSession } from '../utils';

const project: ProjectSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Borewell Project – Phase 1',
  description: 'Drinking water for three villages',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  sdgGoals: [6],
  csrCategory: 'Safe drinking water and sanitation',
  status: 'active',
  createdAt: '2024-01-02T00:00:00.000Z',
  siteCount: 1,
  assetCount: 4,
  bands: { verified: 3, review: 1, flagged: 0 },
  averageTrust: 88,
};

const site: Site = {
  id: '44444444-4444-4444-8444-444444444444',
  projectId: project.id,
  name: 'Village Rampur',
  lat: 28.47,
  lng: 77.03,
  radiusM: 500,
  createdAt: '2024-01-03T00:00:00.000Z',
  assetCount: 4,
};

const settings = { settings: DEFAULT_ORG_SETTINGS, updatedAt: '2024-01-01T00:00:00.000Z' };

describe('project detail', () => {
  it('shows live project figures on the overview', async () => {
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      [`GET /api/projects/${project.id}`]: [200, project],
    });
    renderRoute(`/app/projects/${project.id}`);
    expect(await screen.findByRole('heading', { name: project.name })).toBeVisible();
    expect(screen.getByText('75%')).toBeVisible(); // 3 of 4 verified
    expect(screen.getByText('88')).toBeVisible();
    expect(screen.getByRole('button', { name: /Edit/ })).toBeVisible();
  });

  it('says so when a project doesn’t exist', async () => {
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      [`GET /api/projects/${project.id}`]: [404, { error: 'Project not found' }],
    });
    renderRoute(`/app/projects/${project.id}`);
    expect(await screen.findByText('Project not found')).toBeVisible();
  });

  it('lists sites with their evidence counts; viewers get no edit controls', async () => {
    mockApi({
      'GET /api/auth/me': [200, viewerSession],
      [`GET /api/projects/${project.id}`]: [200, project],
      [`GET /api/projects/${project.id}/sites`]: [200, { sites: [site] }],
    });
    renderRoute(`/app/projects/${project.id}/sites`);
    expect(await screen.findByRole('heading', { name: 'Village Rampur' })).toBeVisible();
    expect(screen.getByText(/radius 500 m/)).toBeVisible();
    expect(screen.getByText('4 files')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Add site/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Village Rampur' })).toBeNull();
  });

  it('validates a new site before sending it', async () => {
    const { calls } = mockApi({
      'GET /api/auth/me': [200, adminSession],
      [`GET /api/projects/${project.id}`]: [200, { ...project, siteCount: 0 }],
      [`GET /api/projects/${project.id}/sites`]: [200, { sites: [] }],
    });
    renderRoute(`/app/projects/${project.id}/sites`);
    await userEvent.click(await screen.findByRole('button', { name: /Add site/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add site' }));
    expect(screen.getByText('Give the site a name')).toBeVisible();
    expect(screen.getByText(/Pick a location on the map or enter a latitude/)).toBeVisible();
    expect(calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });
});

describe('settings', () => {
  it('previews how many assets would change band before saving', async () => {
    const summary: RescoreSummary = {
      total: 12,
      scoreChanged: 5,
      bandChanged: 3,
      transitions: [{ from: 'verified', to: 'review', count: 3 }],
    };
    const { calls } = mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/settings': [200, settings],
      'GET /api/users': [200, { members: [] }],
      'POST /api/settings/preview': [200, summary],
    });
    renderRoute('/app/settings');
    const late = await screen.findByLabelText('Late upload after');
    fireEvent.change(late, { target: { value: '30' } });

    expect(await screen.findByText('3 of 12 assets would change band.')).toBeVisible();
    expect(screen.getByText(/Verified/, { selector: 'li' })).toHaveTextContent(
      'Verified Needs review: 3',
    );
    const preview = calls.find((c) => c.key === 'POST /api/settings/preview');
    expect(preview?.body).toMatchObject({ lateUploadDays: 30 });
    expect(calls.some((c) => c.key === 'PUT /api/settings')).toBe(false);
  });

  it('won’t save band cut-offs in the wrong order', async () => {
    const { calls } = mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/settings': [200, settings],
      'GET /api/users': [200, { members: [] }],
    });
    renderRoute('/app/settings');
    // Drag "Verified from" to 0 with the keyboard: below the review cut-off (50).
    const thumb = await screen.findByRole('slider', { name: 'Verified from' });
    thumb.focus();
    await userEvent.keyboard('{Home}');

    expect(
      screen.getByText('The "verified" cut-off must be higher than the "review" cut-off'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save and re-score' })).toBeDisabled();
    expect(screen.getByText('Fix the highlighted setting to see a preview.')).toBeVisible();
    expect(calls.some((c) => c.key === 'POST /api/settings/preview')).toBe(false);
  });

  it('shows viewers the same numbers, read-only', async () => {
    mockApi({
      'GET /api/auth/me': [200, viewerSession],
      'GET /api/settings': [200, settings],
    });
    renderRoute('/app/settings');
    expect(await screen.findByText(/Only admins\s+can change them/)).toBeVisible();
    expect(screen.getByLabelText('Late upload after')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save and re-score' })).toBeNull();
    expect(screen.queryByText('Team')).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('Late upload after')).toHaveValue(90));
  });
});
