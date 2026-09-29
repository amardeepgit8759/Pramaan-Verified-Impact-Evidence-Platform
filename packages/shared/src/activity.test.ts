import { describe, expect, it } from 'vitest';
import { describeEvent } from './activity.js';

const P = { projectName: 'Borewell Project – Phase 1' };

describe('describeEvent', () => {
  it.each([
    ['asset.created', { ...P, band: 'flagged' }, 'New asset flagged in Borewell Project – Phase 1'],
    [
      'asset.created',
      { ...P, band: 'review' },
      'New asset needing review in Borewell Project – Phase 1',
    ],
    ['asset.created', {}, 'New asset uploaded'],
    [
      'asset.rescored',
      { ...P, band: 'flagged', previousBand: 'verified' },
      'An asset in Borewell Project – Phase 1 moved from verified to flagged',
    ],
    [
      'asset.rescored',
      { ...P, band: 'verified', previousBand: 'verified' },
      'An asset in Borewell Project – Phase 1 was re-scored',
    ],
    ['asset.rescored', {}, 'An asset was re-scored'],
    [
      'asset.reviewed',
      { ...P, decision: 'approve', actorName: 'Asha' },
      'Asha approved an asset in Borewell Project – Phase 1',
    ],
    ['asset.reviewed', { decision: 'reject' }, 'An admin rejected an asset'],
    ['report.created', P, 'New report generated in Borewell Project – Phase 1'],
    [
      'report.created',
      { ...P, status: 'failed' },
      'A report couldn’t be generated in Borewell Project – Phase 1',
    ],
    ['settings.updated', { bandChanged: 3 }, 'Trust settings changed; 3 assets changed band'],
    ['settings.updated', { bandChanged: 0 }, 'Trust settings changed'],
    ['settings.updated', {}, 'Trust settings changed'],
    [
      'site.gap_changed',
      { ...P, siteName: 'Village Rampur', gap: true },
      'Village Rampur in Borewell Project – Phase 1 has a documentation gap',
    ],
    ['site.gap_changed', { gap: false }, 'A site has fresh verified evidence'],
  ] as const)('%s %j', (type, payload, text) => {
    expect(describeEvent({ type, payload })).toBe(text);
  });
});
