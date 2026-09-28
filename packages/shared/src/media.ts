/** Thumbnails keep a photo's shape within these bounds, so a masonry grid stays tidy. */
const MIN_ASPECT = 3 / 4;
const MAX_ASPECT = 4 / 3;

/**
 * Width/height for an asset's grid thumbnail: its own shape, clamped between portrait 3:4
 * and landscape 4:3. Square when the size is unknown. The web app uses the same value to
 * reserve space before the image loads.
 */
export function thumbnailAspect(width: number | null, height: number | null): number {
  if (!width || !height) return 1;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, width / height));
}
