import type { Site } from '@pramaan/shared';
import { Circle, Tooltip } from 'react-leaflet';
import { BaseMap, FitBounds } from './base-map';
import { siteBounds } from './bounds';

/** Every site of a project as a circle of its allowed radius. */
export default function SitesMap({ sites, className }: { sites: Site[]; className?: string }) {
  return (
    <BaseMap label="Map of project sites" className={className}>
      {sites.map((site) => (
        <Circle
          key={site.id}
          center={[site.lat, site.lng]}
          radius={site.radiusM}
          className="map-site"
          pathOptions={{ weight: 2 }}
        >
          <Tooltip direction="top" sticky>
            {site.name}
          </Tooltip>
        </Circle>
      ))}
      <FitBounds bounds={siteBounds(sites)} />
    </BaseMap>
  );
}
