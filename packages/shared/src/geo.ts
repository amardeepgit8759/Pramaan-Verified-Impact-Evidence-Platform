const EARTH_RADIUS_KM = 6371.0088;

export interface LatLng {
  lat: number;
  lng: number;
}

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface SiteArea extends LatLng {
  id: string;
  radiusM: number;
}

/** The closest site to the point, however far; null only when there are no sites. */
export function nearestSite<S extends SiteArea>(point: LatLng, sites: readonly S[]) {
  let best: { site: S; distanceKm: number } | null = null;
  for (const site of sites) {
    const distanceKm = haversineKm(point, site);
    if (!best || distanceKm < best.distanceKm) best = { site, distanceKm };
  }
  return best;
}

/**
 * The nearest site whose radius contains the point, or null when the point is outside
 * every site. Used to auto-assign an asset to a site from its GPS.
 */
export function nearestSiteWithin<S extends SiteArea>(point: LatLng, sites: readonly S[]) {
  return nearestSite(
    point,
    sites.filter((site) => haversineKm(point, site) * 1000 <= site.radiusM),
  );
}
