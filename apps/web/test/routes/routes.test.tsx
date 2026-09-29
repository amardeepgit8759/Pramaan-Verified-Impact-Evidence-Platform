import type { ProjectSummary } from '@pramaan/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BandBadge } from '@/components/band-badge';
import { adminSession, mockApi, renderRoute, viewerSession } from '../utils';

const emptyStats = { totalAssets: 0, verifiedAssets: 0, projects: 0, sites: 0, reports: 0 };

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
  siteCount: 2,
  assetCount: 5,
  bands: { verified: 3, review: 1, flagged: 1 },
  averageTrust: 78.4,
};

describe('landing page', () => {
  it('hides the stats strip when the platform has no evidence yet', async () => {
    mockApi({ 'GET /api/auth/me': [401, {}], 'GET /api/public/stats': [200, emptyStats] });
    renderRoute('/');
    expect(await screen.findByRole('heading', { name: /Proof, not promises/ })).toBeVisible();
    await waitFor(() => expect(screen.queryByText(/photos and videos verified/)).toBeNull());
  });

  it('shows real totals when there are some', async () => {
    mockApi({
      'GET /api/auth/me': [401, {}],
      'GET /api/public/stats': [
        200,
        { totalAssets: 40, verifiedAssets: 1234, projects: 3, sites: 1, reports: 2 },
      ],
    });
    renderRoute('/');
    expect(await screen.findByText('photos and videos verified')).toBeVisible();
    expect(screen.getByText((1234).toLocaleString())).toBeVisible();
    expect(screen.getByText('field site')).toBeVisible();
  });
});

describe('sign-in', () => {
  it('validates with the shared schema before calling the API', async () => {
    const { calls } = mockApi({ 'GET /api/auth/me': [401, {}] });
    renderRoute('/signin');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address')).toBeVisible();
    expect(screen.getByText('Enter your password')).toBeVisible();
    expect(calls.filter((c) => c.key === 'POST /api/auth/login')).toHaveLength(0);
  });

  it('shows the server’s message for a wrong password', async () => {
    mockApi({
      'GET /api/auth/me': [401, {}],
      'POST /api/auth/login': [401, { error: 'That email and password combination is not right' }],
    });
    renderRoute('/signin');
    await userEvent.type(await screen.findByLabelText('Email'), 'asha@example.org');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password combination is not right',
    );
  });

  it('goes to the requested page after signing in', async () => {
    let signedIn = false;
    mockApi({
      'GET /api/auth/me': () => (signedIn ? [200, adminSession] : [401, {}]),
      'POST /api/auth/login': () => {
        signedIn = true;
        return [200, adminSession];
      },
      'GET /api/projects': [200, { projects: [] }],
    });
    const { router } = renderRoute('/signin?next=%2Fapp%2Fprojects');
    await userEvent.type(await screen.findByLabelText('Email'), 'asha@example.org');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/projects'));
  });
});

describe('app shell', () => {
  it('sends signed-out visitors to sign-in and remembers where they were going', async () => {
    mockApi({ 'GET /api/auth/me': [401, {}] });
    const { router } = renderRoute('/app/projects');
    await waitFor(() => expect(router.state.location.pathname).toBe('/signin'));
    expect(router.state.location.search).toBe('?next=%2Fapp%2Fprojects');
  });
});

describe('projects', () => {
  it('invites an admin to create the first project', async () => {
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/projects': [200, { projects: [] }],
    });
    renderRoute('/app/projects');
    expect(await screen.findByText('Create your first project')).toBeVisible();
    expect(screen.getByRole('button', { name: /New project/ })).toBeVisible();
  });

  it('tells a viewer to wait for their admin, with no create button', async () => {
    mockApi({
      'GET /api/auth/me': [200, viewerSession],
      'GET /api/projects': [200, { projects: [] }],
    });
    renderRoute('/app/projects');
    expect(await screen.findByText('No projects yet')).toBeVisible();
    expect(screen.queryByRole('button', { name: /New project/ })).toBeNull();
  });

  it('renders each project with its live counts and trust split', async () => {
    mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/projects': [200, { projects: [project] }],
    });
    renderRoute('/app/projects');
    const card = (await screen.findByRole('heading', { name: project.name })).closest('article')!;
    const scope = within(card as HTMLElement);
    expect(scope.getByText('5 files')).toBeVisible();
    expect(scope.getByText('2 sites')).toBeVisible();
    expect(scope.getByText('78')).toBeVisible();
    expect(scope.getByRole('img', { name: '3 verified, 1 needs review, 1 flagged' })).toBeVisible();
  });

  it('creates a project and refreshes the list', async () => {
    let projects: ProjectSummary[] = [];
    const { calls } = mockApi({
      'GET /api/auth/me': [200, adminSession],
      'GET /api/projects': () => [200, { projects }],
      'POST /api/projects': () => {
        projects = [project];
        return [201, project];
      },
    });
    renderRoute('/app/projects');
    await userEvent.click(await screen.findByRole('button', { name: /New project/ }));
    await userEvent.type(screen.getByLabelText('Project name'), project.name);
    await userEvent.type(screen.getByLabelText('Start date'), '2024-01-01');
    await userEvent.click(screen.getByRole('button', { name: /Clean Water and Sanitation/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('heading', { name: project.name })).toBeVisible();
    const post = calls.find((c) => c.key === 'POST /api/projects');
    expect(post?.body).toMatchObject({
      name: project.name,
      startDate: '2024-01-01',
      sdgGoals: [6],
    });
  });
});

describe('BandBadge', () => {
  it('pairs colour with an icon and a text label', () => {
    render(<BandBadge band="review" />);
    const badge = screen.getByText('Needs review');
    expect(badge.querySelector('svg')).not.toBeNull();
  });
});
