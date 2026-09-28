import type { Asset, Site, TrustBand } from '@pramaan/shared';
import { latLng } from 'leaflet';
import { Circle, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import { BandBadge } from '@/components/band-badge';
import { altText } from '@/lib/assets';
import { BaseMap, FitBounds } from './base-map';
import { siteBounds } from './bounds';

const PIN_CLASS: Record<TrustBand, string> = {
  verified: 'map-pin-verified',
  review: 'map-pin-review',
  flagged: 'map-pin-flagged',
};

/**
 * Sites as circles of their radius, evidence as pins coloured by band. Clicking a pin
 * previews it; "Open details" opens the evidence drawer.
 */
export default function EvidenceMap({
  sites,
  assets,
  onOpenAsset,
}: {
  sites: Site[];
  assets: Asset[];
  onOpenAsset: (id: string) => void;
}) {
  const located = assets.filter((a) => a.lat !== null && a.lng !== null);
  const pinBounds = located.map((a) => latLng(a.lat!, a.lng!).toBounds(200));
  const bounds = [siteBounds(sites), ...pinBounds].reduce(
    (acc, b) => (acc && b ? acc.extend(b) : (acc ?? b)),
    null,
  );

  return (
    <BaseMap label="Map of sites and evidence" className="h-[28rem] lg:h-[34rem]">
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
      {located.map((a) => (
        <CircleMarker
          key={a.id}
          center={[a.lat!, a.lng!]}
          radius={9}
          className={PIN_CLASS[a.trustBand]}
          pathOptions={{ weight: 3, fillOpacity: 1 }}
        >
          <Popup minWidth={200} maxWidth={240}>
            <div className="space-y-2 font-sans">
              <img
                src={a.thumbnailUrl}
                alt={altText(a)}
                className="aspect-[4/3] w-full rounded-lg object-cover"
              />
              <div className="flex items-center justify-between gap-2">
                <BandBadge band={a.trustBand} />
                <span className="text-sm font-semibold">{a.trustScore}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenAsset(a.id)}
                className="w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                Open details
              </button>
            </div>
          </Popup>
        </CircleMarker>
      ))}
      <FitBounds bounds={bounds} />
    </BaseMap>
  );
}
