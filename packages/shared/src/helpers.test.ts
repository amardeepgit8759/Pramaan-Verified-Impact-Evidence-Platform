import { describe, expect, it } from 'vitest';
import { isReportEligible, siteGapStatus } from './evidence.js';
import { formatDay, formatDistance, plural } from './format.js';
import { haversineKm, nearestSite, nearestSiteWithin } from './geo.js';
import { hammingDistance, isPhashBits, phashFromHex } from './phash.js';

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm({ lat: 28.6, lng: 77.2 }, { lat: 28.6, lng: 77.2 })).toBe(0);
  });

  it('matches the known Delhi–Mumbai great-circle distance (~1,150 km)', () => {
    const km = haversineKm({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 });
    expect(km).toBeGreaterThan(1140);
    expect(km).toBeLessThan(1160);
  });

  it('handles antipodal points', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(20015.1, 0);
  });
});

describe('nearestSite', () => {
  it('returns the closest site however far away it is', () => {
    const sites = [
      { id: 'near', lat: 28.5, lng: 77.0, radiusM: 10 },
      { id: 'far', lat: 30, lng: 80, radiusM: 100_000 },
    ];
    const result = nearestSite({ lat: 28.6, lng: 77.0 }, sites);
    expect(result?.site.id).toBe('near');
    expect(result?.distanceKm).toBeCloseTo(11.1, 1);
  });

  it('returns null with no sites', () => {
    expect(nearestSite({ lat: 0, lng: 0 }, [])).toBeNull();
  });
});

describe('nearestSiteWithin', () => {
  const sites = [
    { id: 'a', lat: 28.47, lng: 77.03, radiusM: 500 },
    { id: 'b', lat: 28.4705, lng: 77.03, radiusM: 500 },
    { id: 'c', lat: 29.0, lng: 77.0, radiusM: 100_000 },
  ];

  it('picks the closest site whose radius contains the point', () => {
    expect(nearestSiteWithin({ lat: 28.4706, lng: 77.03 }, sites)?.site.id).toBe('b');
  });

  it('skips closer sites whose radius is too small', () => {
    const result = nearestSiteWithin({ lat: 28.6, lng: 77.03 }, sites);
    expect(result?.site.id).toBe('c');
    expect(result?.distanceKm).toBeGreaterThan(40);
  });

  it('returns null when outside every site', () => {
    expect(nearestSiteWithin({ lat: 10, lng: 10 }, sites)).toBeNull();
    expect(nearestSiteWithin({ lat: 10, lng: 10 }, [])).toBeNull();
  });
});

describe('phash helpers', () => {
  it('converts Cloudinary hex to a 64-bit string', () => {
    expect(phashFromHex('ba19c8ab5fa05a59')).toBe(
      '1011101000011001110010001010101101011111101000000101101001011001',
    );
    expect(phashFromHex('  1  ')).toBe(`${'0'.repeat(63)}1`);
    expect(phashFromHex('F'.repeat(16))).toBe('1'.repeat(64));
  });

  it.each(['', 'xyz', '1'.repeat(17), '0x12'])('rejects %j', (hex) => {
    expect(phashFromHex(hex)).toBeNull();
  });

  it('validates bit strings', () => {
    expect(isPhashBits('0'.repeat(64))).toBe(true);
    expect(isPhashBits('0'.repeat(63))).toBe(false);
    expect(isPhashBits('2'.repeat(64))).toBe(false);
  });

  it('counts differing bits', () => {
    expect(hammingDistance('0'.repeat(64), '0'.repeat(64))).toBe(0);
    expect(hammingDistance('0'.repeat(64), '1'.repeat(64))).toBe(64);
    expect(hammingDistance(`101${'0'.repeat(61)}`, `011${'0'.repeat(61)}`)).toBe(2);
  });

  it('refuses malformed input', () => {
    expect(() => hammingDistance('01', '0'.repeat(64))).toThrow(/64-character/);
    expect(() => hammingDistance('0'.repeat(64), 'x')).toThrow(/64-character/);
  });
});

describe('format helpers', () => {
  it('formats days in UTC', () => {
    expect(formatDay(new Date('2024-03-05T23:30:00Z'))).toBe('5 Mar 2024');
    expect(formatDay(new Date('2024-12-31T00:00:00Z'))).toBe('31 Dec 2024');
  });

  it('formats distances', () => {
    expect(formatDistance(0.0634)).toBe('63 m');
    expect(formatDistance(0.9994)).toBe('999 m');
    expect(formatDistance(1)).toBe('1.0 km');
    expect(formatDistance(41.234)).toBe('41.2 km');
  });

  it('pluralises', () => {
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(0, 'day')).toBe('0 days');
    expect(plural(3, 'day')).toBe('3 days');
  });
});

describe('isReportEligible', () => {
  it.each([
    ['verified', null, true],
    ['verified', 'approve', true],
    ['verified', 'reject', false],
    ['review', null, false],
    ['review', 'approve', true],
    ['review', 'reject', false],
    ['flagged', null, false],
    ['flagged', 'approve', true],
  ] as const)('%s with decision %s → %s', (band, decision, expected) => {
    expect(isReportEligible(band, decision)).toBe(expected);
  });
});

describe('siteGapStatus', () => {
  const now = new Date('2024-06-30T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it('flags an active site that never had verified evidence', () => {
    expect(
      siteGapStatus({ projectStatus: 'active', lastVerifiedAt: null, gapDays: 30, now }),
    ).toEqual({ gap: true, reason: 'No verified evidence yet', daysSinceVerified: null });
  });

  it('flags an active site whose last verified evidence is older than the window', () => {
    expect(
      siteGapStatus({ projectStatus: 'active', lastVerifiedAt: daysAgo(31), gapDays: 30, now }),
    ).toEqual({ gap: true, reason: 'No verified evidence for 31 days', daysSinceVerified: 31 });
  });

  it('does not flag at exactly the window', () => {
    expect(
      siteGapStatus({ projectStatus: 'active', lastVerifiedAt: daysAgo(30), gapDays: 30, now }),
    ).toEqual({ gap: false, reason: 'Last verified evidence 30 days ago', daysSinceVerified: 30 });
  });

  it('treats a future timestamp as 0 days', () => {
    expect(
      siteGapStatus({ projectStatus: 'active', lastVerifiedAt: daysAgo(-2), gapDays: 30, now })
        .daysSinceVerified,
    ).toBe(0);
  });

  it.each(['completed', 'archived'] as const)('never flags a %s project', (projectStatus) => {
    expect(siteGapStatus({ projectStatus, lastVerifiedAt: null, gapDays: 30, now })).toEqual({
      gap: false,
      reason: 'Project is not active',
      daysSinceVerified: null,
    });
  });
});
