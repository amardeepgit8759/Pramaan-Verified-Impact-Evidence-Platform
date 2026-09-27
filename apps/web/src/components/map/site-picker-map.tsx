import type { Site } from '@pramaan/shared';
import { latLng } from 'leaflet';
import { useEffect } from 'react';
import { Circle, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { BaseMap, FitBounds } from './base-map';
import { siteBounds } from './bounds';

export interface PickedPoint {
  lat: number;
  lng: number;
}

function ClickToPick({ onPick }: { onPick: (p: PickedPoint) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) }),
  });
  return null;
}

/** Follow the point when it's set from the inputs or "use my location". */
function FollowPoint({ point, radiusM }: { point: PickedPoint | null; radiusM: number }) {
  const map = useMap();
  useEffect(() => {
    if (point) {
      map.fitBounds(latLng(point.lat, point.lng).toBounds(radiusM * 3), { maxZoom: 16 });
    }
  }, [map, point, radiusM]);
  return null;
}

/** 6 decimal places ≈ 11 cm: plenty for a site centre. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Click the map to place the site. Other sites of the project are shown faintly for
 * context; with no point yet, the view fits them.
 */
export default function SitePickerMap({
  point,
  radiusM,
  onPick,
  otherSites,
}: {
  point: PickedPoint | null;
  radiusM: number;
  onPick: (p: PickedPoint) => void;
  otherSites: Site[];
}) {
  return (
    <BaseMap label="Click the map to place the site" className="h-64 cursor-crosshair sm:h-72">
      <ClickToPick onPick={onPick} />
      {otherSites.map((s) => (
        <Circle
          key={s.id}
          center={[s.lat, s.lng]}
          radius={s.radiusM}
          className="map-site-muted"
          pathOptions={{ weight: 1 }}
          interactive={false}
        />
      ))}
      {point ? (
        <>
          <Circle
            center={[point.lat, point.lng]}
            radius={radiusM}
            className="map-site"
            pathOptions={{ weight: 2 }}
            interactive={false}
          />
          <CircleMarker
            center={[point.lat, point.lng]}
            radius={6}
            className="map-pin"
            pathOptions={{ weight: 2, fillOpacity: 1 }}
            interactive={false}
          />
          <FollowPoint point={point} radiusM={radiusM} />
        </>
      ) : (
        <FitBounds bounds={siteBounds(otherSites)} />
      )}
    </BaseMap>
  );
}
