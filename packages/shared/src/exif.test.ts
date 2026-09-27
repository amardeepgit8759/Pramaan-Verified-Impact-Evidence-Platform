import { describe, expect, it } from 'vitest';
import { parseExifDate, parseGpsCoordinate, parseGpsPosition } from './exif.js';

const DMS = 28 + 28 / 60 + 12.3 / 3600;

describe('parseGpsCoordinate', () => {
  it.each([
    ['decimal number', 28.4701, 'lat', undefined, 28.4701],
    ['negative number', -77.02, 'lng', undefined, -77.02],
    ['decimal string', '28.4701', 'lat', undefined, 28.4701],
    ['negative decimal string', '-33.8688', 'lat', undefined, -33.8688],
    ['decimal with inline hemisphere', '33.8688 S', 'lat', undefined, -33.8688],
    ['ExifTool DMS with hemisphere', `28 deg 28' 12.3" N`, 'lat', undefined, DMS],
    ['ExifTool DMS, south', `28 deg 28' 12.30" S`, 'lat', undefined, -DMS],
    ['degree symbol DMS, no spaces', `28°28'12.3"N`, 'lat', undefined, DMS],
    ['DMS with west', `77 deg 1' 34.56" W`, 'lng', undefined, -(77 + 1 / 60 + 34.56 / 3600)],
    ['hemisphere first', `N 28 deg 28' 12.3"`, 'lat', undefined, DMS],
    ['DMS with separate ref "S"', `28 deg 28' 12.3"`, 'lat', 'S', -DMS],
    ['DMS with separate ref "South"', `28 deg 28' 12.3"`, 'lat', 'South', -DMS],
    [
      'DMS with separate ref "West"',
      `77 deg 1' 34.56"`,
      'lng',
      'West',
      -(77 + 1 / 60 + 34.56 / 3600),
    ],
    ['number with ref "E"', 77.02, 'lng', 'E', 77.02],
    ['degrees and minutes only', `28 deg 30'`, 'lat', 'N', 28.5],
    ['EXIF rationals', '28/1 28/1 1230/100', 'lat', 'N', DMS],
    ['negative zero degrees', `-0 deg 30' 0"`, 'lat', undefined, -0.5],
    ['ignores an unknown ref', '28.5', 'lat', 'X', 28.5],
    ['ignores a blank ref', '28.5', 'lat', '  ', 28.5],
  ] as const)('parses %s', (_label, value, axis, ref, expected) => {
    expect(parseGpsCoordinate(value, axis, ref)).toBeCloseTo(expected, 6);
  });

  it.each([
    ['undefined', undefined, 'lat', undefined],
    ['an object', { lat: 1 }, 'lat', undefined],
    ['NaN', Number.NaN, 'lat', undefined],
    ['an empty string', '', 'lat', undefined],
    ['text without numbers', 'unknown', 'lat', undefined],
    ['too many numbers', '1 2 3 4', 'lat', undefined],
    ['minutes ≥ 60', `28 deg 60' 0"`, 'lat', undefined],
    ['negative minutes', '28 -5 3', 'lat', undefined],
    ['seconds ≥ 60', `28 deg 1' 60"`, 'lat', undefined],
    ['fractional degrees with minutes', `28.5 deg 30'`, 'lat', undefined],
    ['a zero denominator', '28/0', 'lat', undefined],
    ['latitude above 90', '91', 'lat', undefined],
    ['longitude above 180', '-181', 'lng', undefined],
    ['a longitude hemisphere on a latitude', '28.5 E', 'lat', undefined],
    ['a latitude ref on a longitude', '77.0', 'lng', 'N'],
  ] as const)('rejects %s', (_label, value, axis, ref) => {
    expect(parseGpsCoordinate(value, axis, ref)).toBeNull();
  });

  it('lets an inline hemisphere win over a separate ref', () => {
    expect(parseGpsCoordinate('28.5 N', 'lat', 'S')).toBe(28.5);
  });
});

describe('parseGpsPosition', () => {
  it('parses ExifTool GPSPosition', () => {
    const pos = parseGpsPosition(`28 deg 28' 12.30" N, 77 deg 1' 34.56" E`);
    expect(pos?.lat).toBeCloseTo(DMS, 6);
    expect(pos?.lng).toBeCloseTo(77 + 1 / 60 + 34.56 / 3600, 6);
  });

  it.each([
    ['a non-string', 42],
    ['a single coordinate', '28.5 N'],
    ['an invalid latitude', '95, 77'],
    ['an invalid longitude', '28, 190'],
  ])('rejects %s', (_label, value) => {
    expect(parseGpsPosition(value)).toBeNull();
  });
});

describe('parseExifDate', () => {
  it.each([
    ['EXIF DateTimeOriginal as UTC', '2024:03:15 10:22:33', undefined, '2024-03-15T10:22:33.000Z'],
    ['EXIF with a separate offset', '2024:03:15 10:22:33', '+05:30', '2024-03-15T04:52:33.000Z'],
    [
      'EXIF with a compact negative offset',
      '2024:03:15 10:22:33',
      '-0400',
      '2024-03-15T14:22:33.000Z',
    ],
    [
      'EXIF with an inline offset',
      '2024:03:15 10:22:33+05:30',
      '-08:00',
      '2024-03-15T04:52:33.000Z',
    ],
    ['fractional seconds', '2024:03:15 10:22:33.4567', undefined, '2024-03-15T10:22:33.456Z'],
    ['no seconds', '2024:03:15 10:22', undefined, '2024-03-15T10:22:00.000Z'],
    ['an ISO timestamp', '2024-03-15T10:22:33Z', undefined, '2024-03-15T10:22:33.000Z'],
    ['padding around the value', '  2024:03:15 10:22:33  ', undefined, '2024-03-15T10:22:33.000Z'],
    ['a leap day', '2024:02:29 00:00:00', undefined, '2024-02-29T00:00:00.000Z'],
    ['an invalid offset (ignored)', '2024:03:15 10:22:33', 'IST', '2024-03-15T10:22:33.000Z'],
  ])('parses %s', (_label, value, offset, iso) => {
    expect(parseExifDate(value, offset)?.toISOString()).toBe(iso);
  });

  it('passes valid Date objects through', () => {
    const d = new Date('2024-03-15T10:22:33Z');
    expect(parseExifDate(d)).toBe(d);
  });

  it.each([
    ['an invalid Date', new Date('nope')],
    ['a number', 1710498153],
    ['an empty string', ''],
    ['the all-zero placeholder', '0000:00:00 00:00:00'],
    ['a date before 1970', '1969:12:31 23:59:59'],
    ['month 13', '2024:13:01 00:00:00'],
    ['day 0', '2024:03:00 00:00:00'],
    ['hour 24', '2024:03:15 24:00:00'],
    ['minute 60', '2024:03:15 10:60:00'],
    ['second 60', '2024:03:15 10:22:60'],
    ['31 April', '2024:04:31 10:00:00'],
    ['29 Feb in a non-leap year', '2023:02:29 10:00:00'],
    ['a date without a time', '2024:03:15'],
  ])('rejects %s', (_label, value) => {
    expect(parseExifDate(value)).toBeNull();
  });
});
