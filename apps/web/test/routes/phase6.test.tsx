import type {
  Asset,
  ProjectSummary,
  ReportDetail,
  ReportSummary,
  ShareLink,
  SharedProject,
  TrustCheck,
} from '@pramaan/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { adminSession, mockApi, renderRoute, viewerSession } from '../utils';

const project: ProjectSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Borewell Project',
  description: 'Hand pumps for three villages',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  sdgGoals: [6],
  csrCategory: 'Drinking water',
  status: 'active',
  createdAt: '2024-01-02T00:00:00.000Z',
  siteCount: 1,
  assetCount: 2,
  bands: { verified: 2, review: 0, flagged: 0 },
  averageTrust: 100,
};

const PUMP = '55555555-5555-4555-8555-555555555555';
const DRY = '66666666-6666-4666-8666-666666666666';
const REPORT = '77777777-7777-4777-8777-777777777777';

const asset = (id: string, caption: string): Asset => ({
  id,
  projectId: project.id,
  projectName: project.name,
  siteId: '44444444-4444-4444-8444-444444444444',
  siteName: 'Village Rampur',
  uploadedBy: null,
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
  caption,
  trustScore: 100,
  trustBand: 'verified',
  reviewDecision: null,
});

const checks: TrustCheck[] = [
  {
    type: 'wrong_location',
    passed: true,
    deduction: 0,
    reason: 'Taken 59 m from Village Rampur',
    detail: {},
  },
];

const summary: ReportSummary = {
  id: REPORT,
  projectId: project.id,
  periodStart: '2024-01-01',
  periodEnd: '2024-12-31',
  status: 'ready',
  summary: 'Two villages gained a hand pump.',
  claimCount: 2,
  citedAssetCount: 2,
  droppedClaims: 1,
  error: null,
  generatedBy: 'Asha Rao',
  createdAt: '2024-12-31T10:00:00.000Z',
};

const detail: ReportDetail = {
  ...summary,
  projectName: project.name,
  organisationName: 'Jal Seva Trust',
  sdgGoals: [6],
  csrCategory: 'Drinking water',
  sections: [
    {
      heading: 'Access to water',
      claims: [
        {
          id: '88888888-8888-4888-8888-888888888881',
          position: 0,
          section: 'Access to water',
          sentence: 'A hand pump now stands at Village Rampur.',
          assetIds: [PUMP],
        },
        {
          id: '88888888-8888-4888-8888-888888888882',
          position: 1,
          section: 'Access to water',
          sentence: 'The site was a dry field before.',
          assetIds: [DRY, PUMP],
        },
      ],
    },
  ],
  evidence: [
    {
      ref: 'E1',
      asset: asset(PUMP, 'A new hand pump'),
      checks,
      reviews: [],
      citedIn: [0, 1],
    },
    {
      ref: 'E2',
      asset: asset(DRY, 'A dry field'),
      checks,
      reviews: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          decision: 'approve',
          note: 'Confirmed on site',
          reviewerName: 'Asha Rao',
          trustScoreAtReview: 100,
          createdAt: '2024-03-12T10:00:00.000Z',
        },
      ],
      citedIn: [1],
    },
  ],
};

const appApi = (session = adminSession) => ({
  'GET /api/auth/me': [200, session] as [number, unknown],
  [`GET /api/projects/${project.id}`]: [200, project] as [number, unknown],
});

describe('Reports tab', () => {
  it('lists reports with their status and generates a new one for the chosen period', async () => {
    const { calls } = mockApi({
      ...appApi(),
      [`GET /api/projects/${project.id}/reports`]: [
        200,
        {
          reports: [
            {
              ...summary,
              id: '77777777-7777-4777-8777-777777777771',
              status: 'generating',
              summary: null,
              claimCount: 0,
            },
            summary,
            {
              ...summary,
              id: '77777777-7777-4777-8777-777777777772',
              status: 'failed',
              error: 'The AI model couldn’t write this report just now.',
            },
          ],
        },
      ],
      [`POST /api/projects/${project.id}/reports`]: (body) => [
        202,
        { ...summary, ...(body as object), status: 'generating' },
      ],
    });
    renderRoute(`/app/projects/${project.id}/reports`);

    expect(await screen.findByText('Writing…')).toBeVisible();
    expect(screen.getByText('Ready')).toBeVisible();
    expect(screen.getByText('The AI model couldn’t write this report just now.')).toBeVisible();
    expect(screen.getByText('2 cited statements · 2 evidence files')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Read report' })).toHaveAttribute(
      'href',
      `/app/projects/${project.id}/reports/${REPORT}`,
    );
    expect(screen.getByRole('link', { name: /PDF/ })).toHaveAttribute(
      'href',
      `/api/reports/${REPORT}/pdf`,
    );

    await userEvent.click(screen.getByRole('button', { name: /Generate report/ }));
    const dialog = await screen.findByRole('dialog');
    // Defaults to the whole project: start date to its end date (already past).
    expect(within(dialog).getByLabelText('From')).toHaveValue('2024-01-01');
    expect(within(dialog).getByLabelText('To')).toHaveValue('2024-12-31');
    await userEvent.clear(within(dialog).getByLabelText('From'));
    await userEvent.type(within(dialog).getByLabelText('From'), '2024-06-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.key === `POST /api/projects/${project.id}/reports`)?.body).toEqual({
      periodStart: '2024-06-01',
      periodEnd: '2024-12-31',
    });
  });

  it('shows why the server refused to generate', async () => {
    mockApi({
      ...appApi(),
      [`GET /api/projects/${project.id}/reports`]: [200, { reports: [] }],
      [`POST /api/projects/${project.id}/reports`]: [
        422,
        { error: 'There’s no verified evidence from 1 Jan 2024 to 31 Dec 2024.' },
      ],
    });
    renderRoute(`/app/projects/${project.id}/reports`);
    expect(await screen.findByText('No reports yet')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Generate report/ }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Generate' }),
    );
    expect(await screen.findByText(/no verified evidence from 1 Jan 2024/)).toBeVisible();
  });

  it('gives viewers the reports but no generate, delete or share controls', async () => {
    mockApi({
      ...appApi(viewerSession),
      [`GET /api/projects/${project.id}/reports`]: [200, { reports: [summary] }],
    });
    renderRoute(`/app/projects/${project.id}/reports`);
    expect(await screen.findByText('Ready')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Generate report/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Share' })).not.toBeInTheDocument();
  });
});

describe('report reader', () => {
  it('opens the evidence behind a statement when it is selected', async () => {
    mockApi({ ...appApi(), [`GET /api/reports/${REPORT}`]: [200, detail] });
    renderRoute(`/app/projects/${project.id}/reports/${REPORT}`);

    expect(await screen.findByRole('heading', { name: 'Access to water' })).toBeVisible();
    expect(screen.getByText('Two villages gained a hand pump.')).toBeVisible();
    expect(screen.getByText(/1 statement the AI drafted was removed/)).toBeVisible();
    expect(screen.getByRole('link', { name: /Download PDF/ })).toHaveAttribute(
      'href',
      `/api/reports/${REPORT}/pdf`,
    );
    expect(screen.getByRole('link', { name: /Evidence annex \(CSV\)/ })).toHaveAttribute(
      'href',
      `/api/reports/${REPORT}/annex.csv`,
    );

    await userEvent.click(screen.getByRole('button', { name: /The site was a dry field before/ }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('Statement 2 cites 2 evidence files.')).toBeVisible();
    expect(within(panel).getByRole('img', { name: 'A dry field' })).toBeVisible();
    expect(within(panel).getByRole('img', { name: 'A new hand pump' })).toBeVisible();
    expect(within(panel).getAllByText('Taken 59 m from Village Rampur')).toHaveLength(2);
    expect(within(panel).getByText('“Confirmed on site”')).toBeVisible();
    expect(within(panel).getAllByRole('button', { name: /Full details/ })).toHaveLength(2);
  });

  it('says so while a report is still being written', async () => {
    mockApi({
      ...appApi(),
      [`GET /api/reports/${REPORT}`]: [
        200,
        { ...detail, status: 'generating', sections: [], evidence: [] },
      ],
    });
    renderRoute(`/app/projects/${project.id}/reports/${REPORT}`);
    expect(await screen.findByText(/Writing your report/)).toBeVisible();
  });
});

describe('Share tab', () => {
  const link: ShareLink = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    token: 'abcdefghijklmnopqrstuvwxyz012345',
    expiresAt: '2099-01-01T00:00:00.000Z',
    expired: false,
    createdBy: 'Asha Rao',
    createdAt: '2024-12-01T00:00:00.000Z',
  };

  it('creates, lists and revokes funder links', async () => {
    const { calls } = mockApi({
      ...appApi(),
      [`GET /api/projects/${project.id}/share-links`]: [
        200,
        {
          links: [
            link,
            {
              ...link,
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              token: 'expiredexpiredexpiredexpiredexpi',
              expired: true,
              expiresAt: '2024-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
      [`POST /api/projects/${project.id}/share-links`]: [201, link],
      [`DELETE /api/share-links/${link.id}`]: [204],
    });
    renderRoute(`/app/projects/${project.id}/share`);

    expect(await screen.findByText(`${window.location.origin}/share/${link.token}`)).toBeVisible();
    expect(screen.getByText('Expired 1 Jan 2024')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: /Create link/ }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.key === `POST /api/projects/${project.id}/share-links`)?.body,
      ).toEqual({
        expiresInDays: 30,
      }),
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Revoke link' })[0]!);
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke link' }));
    await waitFor(() =>
      expect(calls.some((c) => c.key === `DELETE /api/share-links/${link.id}`)).toBe(true),
    );
  });
});

describe('public share page', () => {
  const token = 'abcdefghijklmnopqrstuvwxyz012345';
  const shared: SharedProject = {
    organisationName: 'Jal Seva Trust',
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      startDate: project.startDate,
      endDate: project.endDate,
      sdgGoals: [6],
      csrCategory: 'Drinking water',
      status: 'active',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    metrics: {
      evidence: 2,
      sites: 1,
      sitesWithEvidence: 1,
      averageTrust: 100,
      verifiedPct: 66.7,
      reports: 1,
      lastEvidenceAt: '2024-03-10T09:00:00.000Z',
    },
    sites: [],
    evidence: [
      { asset: asset(PUMP, 'A new hand pump'), checks },
      { asset: asset(DRY, 'A dry field'), checks },
    ],
    reports: [summary],
  };

  it('shows verified evidence, metrics and reports without signing in', async () => {
    const { calls } = mockApi({ [`GET /api/share/${token}`]: [200, shared] });
    renderRoute(`/share/${token}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Borewell Project' }),
    ).toBeVisible();
    expect(screen.getByText('Jal Seva Trust')).toBeVisible();
    expect(screen.getByText('67%')).toBeVisible();
    expect(screen.getByText('1 of 1')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Read report' })).toHaveAttribute(
      'href',
      `/share/${token}/reports/${REPORT}`,
    );
    await userEvent.click(screen.getByRole('button', { name: /A dry field\. Trust Score 100/ }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('Taken 59 m from Village Rampur')).toBeVisible();
    expect(within(panel).queryByRole('button', { name: /Full details/ })).not.toBeInTheDocument();
    // Nothing but the share endpoint: no session, no app API.
    expect(calls.map((c) => c.key)).toEqual([`GET /api/share/${token}`]);
  });

  it('explains expired and broken links', async () => {
    mockApi({ [`GET /api/share/${token}`]: [410, { error: 'This link has expired.' }] });
    renderRoute(`/share/${token}`);
    expect(await screen.findByText('This link has expired')).toBeVisible();
  });

  it('explains revoked links', async () => {
    mockApi({ [`GET /api/share/${token}`]: [404, { error: 'Not found' }] });
    renderRoute(`/share/${token}`);
    expect(await screen.findByText('This link doesn’t work')).toBeVisible();
  });

  it('reads a shared report with share-scoped downloads', async () => {
    mockApi({
      [`GET /api/share/${token}`]: [200, shared],
      [`GET /api/share/${token}/reports/${REPORT}`]: [200, detail],
    });
    renderRoute(`/share/${token}/reports/${REPORT}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Borewell Project' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /Download PDF/ })).toHaveAttribute(
      'href',
      `/api/share/${token}/reports/${REPORT}/pdf`,
    );
    expect(screen.getByRole('link', { name: /Back to the project/ })).toHaveAttribute(
      'href',
      `/share/${token}`,
    );
  });
});
