import { describe, expect, it } from 'vitest';
import {
  ANNEX_CSV_COLUMNS,
  annexCsvRow,
  buildReportFacts,
  csvSafe,
  evidenceOrder,
  REPORT_LIMITS,
  UNASSIGNED_SITE,
  validateReportDraft,
  type AnnexEntry,
  type ReportFactAsset,
} from './report.js';

let n = 0;
const asset = (overrides: Partial<ReportFactAsset> = {}): ReportFactAsset => ({
  id: `a${String(++n).padStart(3, '0')}`,
  siteName: 'Village Rampur',
  resourceType: 'image',
  capturedAt: new Date('2024-03-10T09:00:00Z'),
  uploadedAt: new Date('2024-03-11T09:00:00Z'),
  caption: 'A hand pump',
  tags: ['water pump'],
  trustScore: 100,
  approvedByAdmin: false,
  ...overrides,
});

const project = {
  name: 'Borewell Project',
  description: 'Hand pumps for three villages',
  sdgGoals: [6, 5],
  csrCategory: 'Drinking water',
};
const period = { start: '2024-01-01', end: '2024-12-31' };

describe('buildReportFacts', () => {
  it('summarises eligible evidence by site, month and tag, with before/after pairs', () => {
    const dry = asset({ id: 'dry', capturedAt: new Date('2024-01-05T00:00:00Z'), tags: ['field'] });
    const pump = asset({ id: 'pump', capturedAt: new Date('2024-06-05T00:00:00Z') });
    const video = asset({
      id: 'video',
      resourceType: 'video',
      capturedAt: new Date('2024-07-01T00:00:00Z'),
      tags: ['water pump', 'water pump', 'women'],
    });
    const offSite = asset({ id: 'off', siteName: null, capturedAt: null, approvedByAdmin: true });

    const facts = buildReportFacts({ project, period, assets: [video, pump, offSite, dry] });

    expect(facts.project).toEqual({
      name: 'Borewell Project',
      description: 'Hand pumps for three villages',
      sdg_goals: [
        { goal: 6, name: 'Clean Water and Sanitation' },
        { goal: 5, name: 'Gender Equality' },
      ],
      csr_category: 'Drinking water',
    });
    expect(facts.period).toBe(period);
    expect(facts.totals).toEqual({
      evidence: 4,
      photos: 3,
      videos: 1,
      sites_with_evidence: 1,
      approved_by_admin: 1,
      assets_listed_below: 4,
    });
    // No capture time: the upload day stands in (11 Mar).
    expect(facts.per_site).toEqual([
      {
        site: 'Village Rampur',
        count: 3,
        first_date: '2024-01-05',
        last_date: '2024-07-01',
        asset_ids: ['dry', 'pump', 'video'],
      },
      {
        site: UNASSIGNED_SITE,
        count: 1,
        first_date: '2024-03-11',
        last_date: '2024-03-11',
        asset_ids: ['off'],
      },
    ]);
    expect(facts.per_month.map((m) => [m.month, m.count])).toEqual([
      ['2024-01', 1],
      ['2024-03', 1],
      ['2024-06', 1],
      ['2024-07', 1],
    ]);
    // A tag repeated on one asset counts once; ties sort alphabetically.
    expect(facts.tag_clusters).toEqual([
      { tag: 'water pump', count: 3, asset_ids: ['off', 'pump', 'video'] },
      { tag: 'field', count: 1, asset_ids: ['dry'] },
      { tag: 'women', count: 1, asset_ids: ['video'] },
    ]);
    // Photos only: the later video isn't the "after".
    expect(facts.before_after).toEqual([
      {
        site: 'Village Rampur',
        before: { asset_id: 'dry', date: '2024-01-05', caption: 'A hand pump' },
        after: { asset_id: 'pump', date: '2024-06-05', caption: 'A hand pump' },
      },
    ]);
    expect(facts.assets.map((a) => a.id)).toEqual(['dry', 'off', 'pump', 'video']);
    expect(facts.assets[1]).toEqual({
      id: 'off',
      date: '2024-03-11',
      site: UNASSIGNED_SITE,
      type: 'photo',
      caption: 'A hand pump',
      tags: ['water pump'],
      trust_score: 100,
      approved_by_admin: true,
    });
    expect(facts.assets[3]).toMatchObject({ type: 'video' });
    expect(facts.assets[3]).not.toHaveProperty('approved_by_admin');
  });

  it('makes no pair from same-day photos, and handles an empty description and unknown goals', () => {
    const facts = buildReportFacts({
      project: { ...project, description: '', sdgGoals: [99], csrCategory: null },
      period,
      assets: [asset(), asset()],
    });
    expect(facts.before_after).toEqual([]);
    expect(facts.project).toMatchObject({
      description: null,
      sdg_goals: [{ goal: 99, name: 'Goal 99' }],
      csr_category: null,
    });
  });

  it('caps ids per group and listed assets, always keeping before/after photos', () => {
    const early = asset({ id: 'zz-early', capturedAt: new Date('2023-01-01T00:00:00Z') });
    const late = asset({ id: 'zz-late', capturedAt: new Date('2025-01-01T00:00:00Z') });
    const many = Array.from({ length: REPORT_LIMITS.assets + 10 }, () => asset());
    const facts = buildReportFacts({ project, period, assets: [...many, early, late] });

    expect(facts.totals.evidence).toBe(REPORT_LIMITS.assets + 12);
    expect(facts.totals.assets_listed_below).toBe(REPORT_LIMITS.assets);
    expect(facts.assets).toHaveLength(REPORT_LIMITS.assets);
    expect(facts.assets[0]!.id).toBe('zz-early');
    expect(facts.assets.at(-1)!.id).toBe('zz-late');
    expect(facts.per_site[0]!.asset_ids).toHaveLength(REPORT_LIMITS.idsPerGroup);

    const tags = Array.from({ length: REPORT_LIMITS.tagClusters + 3 }, (_, i) => `tag${i}`);
    const tagged = buildReportFacts({ project, period, assets: [asset({ tags })] });
    expect(tagged.tag_clusters).toHaveLength(REPORT_LIMITS.tagClusters);
  });
});

describe('validateReportDraft', () => {
  const eligible = new Set(['e1', 'e2', 'e3']);

  it('keeps claims that cite only eligible evidence and numbers them in reading order', () => {
    const result = validateReportDraft(
      {
        summary: '  Three villages now have water.  ',
        sections: [
          {
            heading: 'Access to water',
            claims: [
              { sentence: 'A hand pump was installed.', asset_ids: ['e1'] },
              { sentence: 'Queues shortened.', asset_ids: [] },
            ],
          },
          {
            heading: '  ',
            claims: [
              { sentence: '  Women  collect\nwater daily. ', asset_ids: [' E2 ', 'e2', 'e3'] },
            ],
          },
        ],
      },
      eligible,
    );
    expect(result.summary).toBe('Three villages now have water.');
    expect(result.claims).toEqual([
      {
        position: 0,
        section: 'Access to water',
        sentence: 'A hand pump was installed.',
        assetIds: ['e1'],
      },
      {
        position: 1,
        section: 'Findings',
        sentence: 'Women collect water daily.',
        assetIds: ['e2', 'e3'],
      },
    ]);
    expect(result.dropped).toEqual([
      {
        section: 'Access to water',
        sentence: 'Queues shortened.',
        assetIds: [],
        reason: 'uncited',
      },
    ]);
  });

  it('drops a claim that cites anything outside the eligible set, and empty sentences', () => {
    const result = validateReportDraft(
      {
        summary: '',
        sections: [
          {
            heading: 'Outcomes',
            claims: [
              { sentence: 'Crops improved.', asset_ids: ['e1', 'flagged-one'] },
              { sentence: '   ', asset_ids: ['e1'] },
              { sentence: 'Made up.', asset_ids: ['', '  '] },
            ],
          },
        ],
      },
      eligible,
    );
    expect(result.claims).toEqual([]);
    expect(result.dropped.map((d) => d.reason)).toEqual(['ineligible', 'empty', 'uncited']);
  });
});

describe('validateReportDraft: compliance', () => {
  it('drops claims and summary sentences that assert legal compliance', () => {
    const result = validateReportDraft(
      {
        summary:
          'Water reached 3 villages. The project is fully compliant with Schedule VII! It helps.',
        sections: [
          {
            heading: 'Alignment',
            claims: [
              { sentence: 'The work is aligned to SDG 6.', asset_ids: ['e1'] },
              { sentence: 'It complies with the CSR rules.', asset_ids: ['e1'] },
              { sentence: 'Statutory obligations are met.', asset_ids: ['e1'] },
            ],
          },
        ],
      },
      new Set(['e1']),
    );
    expect(result.summary).toBe('Water reached 3 villages. It helps.');
    expect(result.claims.map((c) => c.sentence)).toEqual(['The work is aligned to SDG 6.']);
    expect(result.dropped.map((d) => d.reason)).toEqual(['compliance', 'compliance']);
  });
});

describe('evidenceOrder', () => {
  it('lists cited assets once, in order of first citation', () => {
    expect(evidenceOrder([{ assetIds: ['b', 'a'] }, { assetIds: ['a', 'c'] }])).toEqual([
      'b',
      'a',
      'c',
    ]);
  });
});

describe('evidence annex CSV', () => {
  it('neutralises spreadsheet formulas in free text', () => {
    expect(csvSafe('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(csvSafe('+1')).toBe(`'+1`);
    expect(csvSafe('-1')).toBe(`'-1`);
    expect(csvSafe('@SUM')).toBe(`'@SUM`);
    expect(csvSafe('Village Rampur')).toBe('Village Rampur');
  });

  const entry: AnnexEntry = {
    ref: 'E2',
    asset: {
      id: '11111111-1111-4111-8111-111111111111',
      secureUrl: 'https://res.cloudinary.com/x/image/upload/v1/p.jpg',
      projectName: 'Borewell Project',
      siteName: 'Village Rampur',
      capturedAt: '2024-03-10T09:00:00.000Z',
      uploadedAt: '2024-03-11T09:00:00.000Z',
      lat: 28.4702,
      lng: 77.0301,
      trustScore: 30,
      trustBand: 'flagged',
      reviewDecision: 'approve',
    },
    checks: [
      {
        type: 'exact_duplicate',
        passed: false,
        deduction: 60,
        reason: 'Exact copy of an asset in Phase 1',
      },
      {
        type: 'wrong_location',
        passed: true,
        deduction: 0,
        reason: 'Taken 59 m from Village Rampur',
      },
      {
        type: 'late_upload',
        passed: false,
        deduction: 10,
        reason: 'Uploaded 120 days after capture',
      },
    ],
    reviews: [
      {
        decision: 'approve',
        note: 'Confirmed on site',
        reviewerName: 'Asha Rao',
        trustScoreAtReview: 30,
        createdAt: '2024-03-14T10:00:00.000Z',
      },
      {
        decision: 'reject',
        note: '=cmd',
        reviewerName: 'Ravi Kumar',
        trustScoreAtReview: 30,
        createdAt: '2024-03-12T10:00:00.000Z',
      },
    ],
    citedIn: [0, 3],
  };

  it('fills every column, oldest review first, claims numbered from 1', () => {
    const row = annexCsvRow(entry);
    expect(Object.keys(row)).toEqual([...ANNEX_CSV_COLUMNS]);
    expect(row).toEqual({
      evidence_ref: 'E2',
      asset_id: '11111111-1111-4111-8111-111111111111',
      url: 'https://res.cloudinary.com/x/image/upload/v1/p.jpg',
      project: 'Borewell Project',
      site: 'Village Rampur',
      captured_at: '2024-03-10T09:00:00.000Z',
      uploaded_at: '2024-03-11T09:00:00.000Z',
      latitude: '28.4702',
      longitude: '77.0301',
      trust_score: '30',
      trust_band: 'flagged',
      eligible_because: 'approved by admin',
      checks_passed: '1/3',
      failed_checks:
        'exact_duplicate (-60): Exact copy of an asset in Phase 1; late_upload (-10): Uploaded 120 days after capture',
      review_decision: 'approve',
      review_history:
        '2024-03-12 reject by Ravi Kumar at score 30: =cmd | 2024-03-14 approve by Asha Rao at score 30: Confirmed on site',
      cited_in_claims: '1, 4',
    });
  });

  it('leaves unknown values blank', () => {
    const row = annexCsvRow({
      ...entry,
      asset: {
        ...entry.asset,
        siteName: null,
        capturedAt: null,
        lat: null,
        lng: null,
        reviewDecision: null,
      },
      reviews: [],
    });
    expect(row).toMatchObject({
      site: '',
      captured_at: '',
      latitude: '',
      longitude: '',
      eligible_because: 'verified',
      review_decision: '',
      review_history: '',
    });
  });
});
