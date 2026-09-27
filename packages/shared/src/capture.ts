import { parseExifDate, parseGpsCoordinate, parseGpsPosition } from './exif.js';

/**
 * Pull capture time and GPS out of Cloudinary's `media_metadata`, whatever its shape:
 * flat ExifTool names ("GPSLatitude"), group-prefixed names ("EXIF:GPSLatitude",
 * "Composite:GPSPosition") or nested groups ({ EXIF: { GPSLatitude } }). Photos and
 * phone videos use different tags, so several sources are tried in order.
 */

export interface CaptureData {
  capturedAt: Date | null;
  lat: number | null;
  lng: number | null;
  /** The raw fields the values came from, stored for transparency. */
  sources: Record<string, string>;
}

type Flat = Map<string, { key: string; value: unknown }>;

/** Flatten nested groups and index every field by its bare, lower-cased tag name. */
function flatten(metadata: unknown, into: Flat = new Map(), prefix = ''): Flat {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return into;
  for (const [key, value] of Object.entries(metadata)) {
    const fullKey = prefix ? `${prefix}:${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, into, fullKey);
      continue;
    }
    const tag = key.slice(key.lastIndexOf(':') + 1).toLowerCase();
    // Keep the first occurrence, so top-level/EXIF values win over later duplicates.
    if (!into.has(tag)) into.set(tag, { key: fullKey, value });
  }
  return into;
}

const DATE_TAGS = ['datetimeoriginal', 'createdate', 'creationdate', 'mediacreatedate'];
const OFFSET_TAGS = ['offsettimeoriginal', 'offsettime'];

/** ISO 6709 as written by phones into videos: "+28.4701+077.0302+215.000/". */
export function parseIso6709(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== 'string') return null;
  const m = /^([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)/.exec(value.trim());
  if (!m) return null;
  const lat = parseGpsCoordinate(m[1], 'lat');
  const lng = parseGpsCoordinate(m[2], 'lng');
  return lat === null || lng === null ? null : { lat, lng };
}

/** "lat, lng" or "lat, lng, 215 m Above Sea Level" (QuickTime GPSCoordinates). */
function parseCoordinatePair(value: unknown) {
  if (typeof value !== 'string') return null;
  const parts = value.split(',');
  return parts.length < 2 ? null : parseGpsPosition(parts.slice(0, 2).join(','));
}

export function extractCaptureData(metadata: unknown): CaptureData {
  const fields = flatten(metadata);
  const sources: Record<string, string> = {};
  const get = (tag: string) => fields.get(tag);
  const note = (tag: string) => {
    const field = get(tag);
    if (field) sources[field.key] = String(field.value);
  };

  // Capture time
  let capturedAt: Date | null = null;
  const offsetTag = OFFSET_TAGS.find((t) => get(t));
  for (const tag of DATE_TAGS) {
    const parsed = parseExifDate(get(tag)?.value, offsetTag ? get(offsetTag)?.value : undefined);
    if (parsed) {
      capturedAt = parsed;
      note(tag);
      if (offsetTag) note(offsetTag);
      break;
    }
  }

  // GPS: separate lat/lng tags first, then the combined forms.
  let position: { lat: number; lng: number } | null = null;
  const lat = parseGpsCoordinate(get('gpslatitude')?.value, 'lat', get('gpslatituderef')?.value);
  const lng = parseGpsCoordinate(get('gpslongitude')?.value, 'lng', get('gpslongituderef')?.value);
  if (lat !== null && lng !== null) {
    position = { lat, lng };
    ['gpslatitude', 'gpslatituderef', 'gpslongitude', 'gpslongituderef'].forEach(note);
  } else {
    const combined: [string, (v: unknown) => { lat: number; lng: number } | null][] = [
      ['gpsposition', parseGpsPosition],
      ['gpscoordinates', parseCoordinatePair],
      ['com.apple.quicktime.location.iso6709', parseIso6709],
      ['location', parseIso6709],
    ];
    for (const [tag, parse] of combined) {
      position = parse(get(tag)?.value);
      if (position) {
        note(tag);
        break;
      }
    }
  }

  // Many cameras write 0,0 when they have no fix; that isn't a real location.
  if (position && position.lat === 0 && position.lng === 0) position = null;

  return { capturedAt, lat: position?.lat ?? null, lng: position?.lng ?? null, sources };
}
