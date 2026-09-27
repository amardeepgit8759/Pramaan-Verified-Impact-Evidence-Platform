import type { Site } from '@pramaan/shared';
import { latLng, type LatLngBounds } from 'leaflet';

/** The area covered by every site's full circle. */
export function siteBounds(sites: Pick<Site, 'lat' | 'lng' | 'radiusM'>[]): LatLngBounds | null {
  const [first, ...rest] = sites.map((s) => latLng(s.lat, s.lng).toBounds(s.radiusM * 2));
  if (!first) return null;
  return rest.reduce((acc, b) => acc.extend(b), first);
}
