/**
 * Parsers for the EXIF values Cloudinary returns in `media_metadata`. Coordinates arrive
 * either as decimal degrees ("28.4701", "-77.02") or as degrees/minutes/seconds strings
 * ("28 deg 28' 12.30\" N", "28°28'12.3\"N", "28/1 28/1 1230/100"), with the hemisphere
 * either inside the string or in a separate GPSLatitudeRef / GPSLongitudeRef tag.
 */

export type Axis = 'lat' | 'lng';

const HEMISPHERES: Record<string, { axis: Axis; sign: 1 | -1 }> = {
  n: { axis: 'lat', sign: 1 },
  north: { axis: 'lat', sign: 1 },
  s: { axis: 'lat', sign: -1 },
  south: { axis: 'lat', sign: -1 },
  e: { axis: 'lng', sign: 1 },
  east: { axis: 'lng', sign: 1 },
  w: { axis: 'lng', sign: -1 },
  west: { axis: 'lng', sign: -1 },
};

const LIMIT: Record<Axis, number> = { lat: 90, lng: 180 };
const NUMBER = /-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?/g;
const HEMISPHERE_WORD =
  /\b(north|south|east|west|[nsew])\b\s*$|^\s*\b(north|south|east|west|[nsew])\b/i;

function hemisphere(value: unknown, axis: Axis): 1 | -1 | null | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const h = HEMISPHERES[value.trim().toLowerCase()];
  if (!h) return undefined;
  return h.axis === axis ? h.sign : null;
}

function toNumber(token: string): number {
  const [num, den] = token.split('/');
  return den === undefined ? Number(num) : Number(num) / Number(den);
}

/**
 * Parse one coordinate to signed decimal degrees, or null when the value is missing,
 * malformed, out of range, or its hemisphere belongs to the other axis.
 */
export function parseGpsCoordinate(value: unknown, axis: Axis, ref?: unknown): number | null {
  let magnitude: number;
  let sign: 1 | -1 = 1;
  let inlineHemisphere: 1 | -1 | null | undefined;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    magnitude = Math.abs(value);
    if (value < 0) sign = -1;
  } else if (typeof value === 'string') {
    const match = HEMISPHERE_WORD.exec(value);
    if (match) inlineHemisphere = hemisphere(match[1] ?? match[2], axis);
    if (inlineHemisphere === null) return null;

    const tokens = value.match(NUMBER);
    if (!tokens || tokens.length > 3) return null;
    const [deg, min = 0, sec = 0] = tokens.map(toNumber) as [number, number?, number?];
    if (![deg, min, sec].every(Number.isFinite)) return null;
    // Exactly 60 seconds happens when a writer rounds 59.996″ to two decimals; it's valid.
    if (min < 0 || min >= 60 || sec < 0 || sec > 60) return null;
    if (tokens.length > 1 && !Number.isInteger(deg)) return null;
    magnitude = Math.abs(deg) + min / 60 + sec / 3600;
    if (deg < 0 || Object.is(deg, -0)) sign = -1;
  } else {
    return null;
  }

  const refSign = inlineHemisphere ?? hemisphere(ref, axis);
  if (refSign === null) return null;
  if (refSign !== undefined) sign = refSign;

  if (magnitude > LIMIT[axis]) return null;
  return sign * magnitude;
}

/** Parse ExifTool's combined "GPSPosition" value: "28 deg 28' 12.30\" N, 77 deg 1' 34.56\" E". */
export function parseGpsPosition(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(',');
  if (parts.length !== 2) return null;
  const lat = parseGpsCoordinate(parts[0], 'lat');
  const lng = parseGpsCoordinate(parts[1], 'lng');
  return lat === null || lng === null ? null : { lat, lng };
}

const EXIF_DATE =
  /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const OFFSET = /^(Z|[+-]\d{2}:?\d{2})$/i;

function offsetMinutes(offset: string): number {
  if (offset.toUpperCase() === 'Z') return 0;
  const sign = offset.startsWith('-') ? -1 : 1;
  const digits = offset.slice(1).replace(':', '');
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
}

/**
 * Parse EXIF DateTimeOriginal ("2024:03:15 10:22:33", optionally with fractional seconds
 * or an offset) or an ISO timestamp. EXIF times carry no zone; the separate
 * OffsetTimeOriginal tag ("+05:30") is applied when given, otherwise the time is read as UTC.
 * Returns null for blanks, the all-zero placeholder, and impossible dates.
 */
export function parseExifDate(value: unknown, offset?: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;

  const m = EXIF_DATE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '0', ms = '0', inlineOffset] = m;
  const parts = [y, mo, d, h, mi, s].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const [year, month, day, hour, minute, second] = parts;
  if (
    year < 1970 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const utc = Date.UTC(year, month - 1, day, hour, minute, second, Number(ms.padEnd(3, '0')));
  // Reject rollovers such as 31 April becoming 1 May.
  if (new Date(utc).getUTCDate() !== day) return null;

  const zone =
    inlineOffset ??
    (typeof offset === 'string' && OFFSET.test(offset.trim()) ? offset.trim() : 'Z');
  return new Date(utc - offsetMinutes(zone) * 60_000);
}
