import 'leaflet/dist/leaflet.css';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { cn } from '@/lib/utils';

/** Whole-country view used only when there is nothing to show yet. */
const FALLBACK_VIEW = { center: [22.5, 79] as LatLngExpression, zoom: 4 };

/** OpenStreetMap tiles; the attribution is required by the tile usage policy. */
export function OsmTiles() {
  return (
    <TileLayer
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      maxZoom={19}
    />
  );
}

/** Keep the view fitted to what's on the map whenever that changes. */
export function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  const key = JSON.stringify(bounds);
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/**
 * A map card. `isolate` contains Leaflet's own z-indexes so its panes and controls can
 * never sit above dialogs or the sticky header.
 */
export function BaseMap({
  className,
  children,
  label,
}: {
  className?: string;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      className={cn('isolate overflow-hidden rounded-2xl border bg-muted shadow-soft', className)}
    >
      <MapContainer
        center={FALLBACK_VIEW.center}
        zoom={FALLBACK_VIEW.zoom}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <OsmTiles />
        {children}
      </MapContainer>
    </div>
  );
}
