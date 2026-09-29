import type { MatchedAsset, TrustCheck } from '@pramaan/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TrustBreakdown } from '@/components/trust/trust-breakdown';
import { TrustGauge } from '@/components/trust/trust-gauge';

const MATCH_ID = '66666666-6666-4666-8666-666666666666';

const checks: TrustCheck[] = [
  {
    type: 'exact_duplicate',
    passed: false,
    deduction: 60,
    reason: 'Exact copy of an asset in Borewell Project – Phase 1',
    detail: { matchedAssetId: MATCH_ID, matchedProjectId: 'p1', sameProject: false },
  },
  {
    type: 'near_duplicate',
    passed: true,
    deduction: 0,
    reason: 'No near-copies in other projects',
    detail: {},
  },
  {
    type: 'wrong_location',
    passed: false,
    deduction: 25,
    reason: 'Taken 1.1 km from Village Rampur (allowed radius 500 m)',
    detail: { distanceKm: 1.1 },
  },
  {
    type: 'wrong_time',
    passed: true,
    deduction: 0,
    reason: 'Captured 10 Mar 2024, during the project',
    detail: {},
  },
  {
    type: 'missing_metadata',
    passed: true,
    deduction: 0,
    reason: 'GPS location and capture date are present',
    detail: {},
  },
  {
    type: 'late_upload',
    passed: true,
    deduction: 0,
    reason: 'Uploaded 1 day after it was taken',
    detail: {},
  },
];

const matches: Record<string, MatchedAsset> = {
  [MATCH_ID]: {
    id: MATCH_ID,
    projectId: '77777777-7777-4777-8777-777777777777',
    projectName: 'Borewell Project – Phase 1',
    thumbnailUrl: 'https://res.cloudinary.com/x/image/upload/a.jpg',
    trustBand: 'flagged',
  },
};

const row = (type: string) => document.querySelector(`[data-check="${type}"]`) as HTMLElement;

describe('TrustBreakdown', () => {
  it('lists all six checks with pass or fail, deduction and reason', () => {
    render(<TrustBreakdown checks={checks} matches={matches} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);

    const location = within(row('wrong_location'));
    expect(location.getByText('Location')).toBeVisible();
    expect(location.getByText('Failed')).toBeVisible();
    expect(location.getByLabelText('minus 25 points')).toHaveTextContent('−25');
    expect(
      location.getByText('Taken 1.1 km from Village Rampur (allowed radius 500 m)'),
    ).toBeVisible();

    const time = within(row('wrong_time'));
    expect(time.getByText('Passed')).toBeVisible();
    expect(time.getByLabelText('no deduction')).toHaveTextContent('0');
  });

  it('shows the arithmetic: 100 minus every deduction', () => {
    render(<TrustBreakdown checks={checks} matches={matches} />);
    expect(screen.getByText(/100 − 85 =/)).toHaveTextContent('100 − 85 = 15');
  });

  it('links a failed duplicate check to the asset it matched', async () => {
    const onOpenAsset = vi.fn();
    render(<TrustBreakdown checks={checks} matches={matches} onOpenAsset={onOpenAsset} />);
    const link = within(row('exact_duplicate')).getByRole('button', { name: /Matched asset/ });
    expect(link).toHaveTextContent('Borewell Project – Phase 1');
    await userEvent.click(link);
    expect(onOpenAsset).toHaveBeenCalledWith(MATCH_ID);
  });

  it('never relies on colour alone: each state has an icon and a word', () => {
    render(<TrustBreakdown checks={checks} matches={matches} />);
    for (const check of checks) {
      const item = within(row(check.type));
      expect(item.getByText(check.passed ? 'Passed' : 'Failed')).toBeVisible();
      expect(row(check.type).querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('TrustGauge', () => {
  it('states the score and band as text', () => {
    render(<TrustGauge score={60} band="review" cutoffs={{ verified: 80, review: 50 }} />);
    expect(screen.getByRole('img', { name: 'Trust Score 60 of 100: Needs review' })).toBeVisible();
    expect(screen.getByText('60')).toBeVisible();
    expect(screen.getByText('Needs review')).toBeVisible();
  });
});
