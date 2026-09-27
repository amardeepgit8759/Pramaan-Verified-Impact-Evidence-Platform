import { describe, expect, it } from 'vitest';
import { extractCaptureData, parseIso6709 } from './capture.js';

const DMS = 28 + 28 / 60 + 12.3 / 3600;
const LNG = 77 + 1 / 60 + 34.56 / 3600;

describe('extractCaptureData', () => {
  it('reads flat ExifTool tags with separate hemisphere refs', () => {
    const data = extractCaptureData({
      DateTimeOriginal: '2024:03:15 10:22:33',
      OffsetTimeOriginal: '+05:30',
      GPSLatitude: `28 deg 28' 12.30"`,
      GPSLatitudeRef: 'North',
      GPSLongitude: `77 deg 1' 34.56"`,
      GPSLongitudeRef: 'East',
      Make: 'Canon',
    });
    expect(data.capturedAt?.toISOString()).toBe('2024-03-15T04:52:33.000Z');
    expect(data.lat).toBeCloseTo(DMS, 6);
    expect(data.lng).toBeCloseTo(LNG, 6);
    expect(data.sources).toEqual({
      DateTimeOriginal: '2024:03:15 10:22:33',
      OffsetTimeOriginal: '+05:30',
      GPSLatitude: `28 deg 28' 12.30"`,
      GPSLatitudeRef: 'North',
      GPSLongitude: `77 deg 1' 34.56"`,
      GPSLongitudeRef: 'East',
    });
  });

  it('reads group-prefixed keys and decimal values', () => {
    const data = extractCaptureData({
      'EXIF:DateTimeOriginal': '2024:03:15 10:22:33',
      'EXIF:GPSLatitude': '-33.8688',
      'EXIF:GPSLongitude': '151.2093',
    });
    expect(data).toMatchObject({ lat: -33.8688, lng: 151.2093 });
    expect(data.sources['EXIF:GPSLatitude']).toBe('-33.8688');
  });

  it('reads nested groups', () => {
    const data = extractCaptureData({
      EXIF: { DateTimeOriginal: '2024:03:15 10:22:33', GPSLatitude: '28.5', GPSLongitude: '77.1' },
      XMP: { Rating: 5 },
    });
    expect(data).toMatchObject({ lat: 28.5, lng: 77.1 });
    expect(data.sources).toHaveProperty('EXIF:GPSLatitude', '28.5');
  });

  it('uses the first occurrence when a tag appears in several groups', () => {
    const data = extractCaptureData({
      DateTimeOriginal: '2024:03:15 10:22:33',
      XMP: { DateTimeOriginal: '2020:01:01 00:00:00' },
    });
    expect(data.capturedAt?.toISOString()).toBe('2024-03-15T10:22:33.000Z');
  });

  it('falls back to GPSPosition and CreateDate', () => {
    const data = extractCaptureData({
      CreateDate: '2024:05:01 08:00:00',
      GPSPosition: `28 deg 28' 12.30" N, 77 deg 1' 34.56" E`,
    });
    expect(data.capturedAt?.toISOString()).toBe('2024-05-01T08:00:00.000Z');
    expect(data.lat).toBeCloseTo(DMS, 6);
  });

  it('reads phone video locations (QuickTime and ISO 6709)', () => {
    const quicktime = extractCaptureData({
      GPSCoordinates: `28 deg 28' 12.30" N, 77 deg 1' 34.56" E, 215 m Above Sea Level`,
    });
    expect(quicktime.lat).toBeCloseTo(DMS, 6);
    const apple = extractCaptureData({
      'com.apple.quicktime.location.ISO6709': '+28.4701+077.0302+215.000/',
    });
    expect(apple).toMatchObject({ lat: 28.4701, lng: 77.0302 });
  });

  it('prefers separate lat/lng tags over combined ones', () => {
    const data = extractCaptureData({
      GPSLatitude: '10',
      GPSLongitude: '20',
      GPSPosition: '30, 40',
    });
    expect(data).toMatchObject({ lat: 10, lng: 20 });
    expect(data.sources).not.toHaveProperty('GPSPosition');
  });

  it('skips a bad date tag and uses the next one', () => {
    const data = extractCaptureData({
      DateTimeOriginal: '0000:00:00 00:00:00',
      CreateDate: '2024:05:01 08:00:00',
    });
    expect(data.capturedAt?.toISOString()).toBe('2024-05-01T08:00:00.000Z');
    expect(data.sources).toEqual({ CreateDate: '2024:05:01 08:00:00' });
  });

  it('treats a 0,0 fix as no location', () => {
    expect(extractCaptureData({ GPSLatitude: '0', GPSLongitude: '0' })).toMatchObject({
      lat: null,
      lng: null,
    });
  });

  it('returns nothing for missing or unusable metadata', () => {
    for (const input of [undefined, null, 'text', [], {}, { GPSLatitude: '28.5' }]) {
      expect(extractCaptureData(input)).toEqual({
        capturedAt: null,
        lat: null,
        lng: null,
        sources: {},
      });
    }
  });

  it('ignores combined values it can’t parse', () => {
    const data = extractCaptureData({
      GPSPosition: 'somewhere',
      GPSCoordinates: 'no comma here',
      Location: 'x',
    });
    expect(data).toMatchObject({ lat: null, lng: null });
  });
});

describe('parseIso6709', () => {
  it.each([
    ['+28.4701+077.0302+215.000/', { lat: 28.4701, lng: 77.0302 }],
    ['-33.8688+151.2093/', { lat: -33.8688, lng: 151.2093 }],
    ['+28+077/', { lat: 28, lng: 77 }],
  ])('parses %s', (value, expected) => {
    expect(parseIso6709(value)).toEqual(expected);
  });

  it.each([42, '', 'N28 E77', '+95.0+010.0/', '+10.0+190.0/'])('rejects %j', (value) => {
    expect(parseIso6709(value)).toBeNull();
  });
});
